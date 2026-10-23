import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../services/api';
import type { CalculateSuccess } from '../../types/calculator';
import { Calculator } from './Calculator';

vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  calculate: vi.fn(),
  getOperations: vi.fn(),
}));

const calculateMock = vi.mocked(api.calculate);
const getOperationsMock = vi.mocked(api.getOperations);

function setup() {
  const user = userEvent.setup();
  render(<Calculator />);
  return {
    user,
    submit: () => screen.getByRole('button', { name: /calcular/i }),
  };
}

beforeEach(() => {
  getOperationsMock.mockRejectedValue(new api.ApiError('offline', 'NETWORK_ERROR'));
});

describe('<Calculator />', () => {
  it('renders every operation and starts with the submit button disabled', () => {
    const { submit } = setup();

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByRole('radio', { name: /somar/i })).toBeChecked();
    expect(submit()).toBeDisabled();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('calculates and shows the result with its expression', async () => {
    calculateMock.mockResolvedValue({ result: 15, operation: 'add', operands: { a: 10, b: 5 } });
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('Primeiro número'), '10');
    await user.type(screen.getByLabelText('Segundo número'), '5');
    expect(submit()).toBeEnabled();
    await user.click(submit());

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', a: 10, b: 5 });
    expect(await screen.findByTestId('result-value')).toHaveTextContent('15');
    expect(screen.getByText('10 + 5 =')).toBeInTheDocument();
  });

  it('accepts a comma as decimal separator and submits with Enter', async () => {
    calculateMock.mockResolvedValue({ result: 5, operation: 'add', operands: { a: 2.5, b: 2.5 } });
    const { user } = setup();

    await user.type(screen.getByLabelText('Primeiro número'), '2,5');
    await user.type(screen.getByLabelText('Segundo número'), '2.5{Enter}');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', a: 2.5, b: 2.5 });
  });

  it('hides the second operand for sqrt', async () => {
    calculateMock.mockResolvedValue({ result: 4, operation: 'sqrt', operands: { a: 16 } });
    const { user, submit } = setup();

    await user.click(screen.getByRole('radio', { name: /raiz/i }));

    expect(screen.queryByLabelText('Segundo número')).not.toBeInTheDocument();
    expect(screen.getByText('Calcula a raiz quadrada do número.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Número'), '16');
    await user.click(submit());

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'sqrt', a: 16 });
    expect(await screen.findByText('√16 =')).toBeInTheDocument();
  });

  it('uses operation-specific field labels', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('radio', { name: /dividir/i }));
    expect(screen.getByLabelText('Dividendo')).toBeInTheDocument();
    expect(screen.getByLabelText('Divisor')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /potência/i }));
    expect(screen.getByLabelText('Base')).toBeInTheDocument();
    expect(screen.getByLabelText('Expoente')).toBeInTheDocument();
  });

  it('shows validation errors after leaving a field and keeps submit disabled', async () => {
    const { user, submit } = setup();
    const first = screen.getByLabelText('Primeiro número');

    await user.type(first, 'abc');
    expect(screen.queryByText(/use apenas números/i)).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText(/use apenas números/i)).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByLabelText('Segundo número'));
    await user.tab();
    expect(screen.getByText('Informe um número.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('shows a red error banner when the API rejects the calculation', async () => {
    calculateMock.mockRejectedValue(new api.ApiError('division by zero', 'DIVISION_BY_ZERO', 400));
    const { user, submit } = setup();

    await user.click(screen.getByRole('radio', { name: /dividir/i }));
    await user.type(screen.getByLabelText('Dividendo'), '1');
    await user.type(screen.getByLabelText('Divisor'), '0');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não é possível dividir por zero');
  });

  it('shows a spinner and disables submit while loading', async () => {
    let resolve: (value: CalculateSuccess) => void = () => undefined;
    calculateMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('Primeiro número'), '1');
    await user.type(screen.getByLabelText('Segundo número'), '2');
    await user.click(submit());

    expect(screen.getByRole('status')).toHaveTextContent('Calculando');
    expect(submit()).toBeDisabled();

    resolve({ result: 3, operation: 'add', operands: { a: 1, b: 2 } });
    expect(await screen.findByTestId('result-value')).toHaveTextContent('3');
  });

  it('clears fields and result', async () => {
    calculateMock.mockResolvedValue({ result: 3, operation: 'add', operands: { a: 1, b: 2 } });
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('Primeiro número'), '1');
    await user.type(screen.getByLabelText('Segundo número'), '2');
    await user.click(submit());
    await screen.findByTestId('result-value');

    await user.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(screen.getByLabelText('Primeiro número')).toHaveValue('');
    expect(screen.getByLabelText('Segundo número')).toHaveValue('');
    expect(screen.queryByTestId('result-value')).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('only offers the operations reported by the API', async () => {
    getOperationsMock.mockResolvedValue([
      { name: 'add', symbol: '+', description: 'Sum', operands: 2 },
      { name: 'sqrt', symbol: '√', description: 'Root', operands: 1 },
    ]);
    setup();

    await waitFor(() => {
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });
  });
});
