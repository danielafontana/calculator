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
    submit: () => screen.getByRole('button', { name: /calculate/i }),
  };
}

beforeEach(() => {
  getOperationsMock.mockRejectedValue(new api.ApiError('offline', 'NETWORK_ERROR'));
});

describe('<Calculator />', () => {
  it('renders every operation and starts with the submit button disabled', () => {
    const { submit } = setup();

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.getByRole('radio', { name: /^add/i })).toBeChecked();
    expect(submit()).toBeDisabled();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('calculates and shows the result with its expression', async () => {
    calculateMock.mockResolvedValue({ result: 15, operation: 'add', operands: { a: 10, b: 5 } });
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('First number'), '10');
    await user.type(screen.getByLabelText('Second number'), '5');
    expect(submit()).toBeEnabled();
    await user.click(submit());

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', a: 10, b: 5 });
    expect(await screen.findByTestId('result-value')).toHaveTextContent('15');
    expect(screen.getByText('10 + 5 =')).toBeInTheDocument();
  });

  it('accepts dot decimals and submits with Enter', async () => {
    calculateMock.mockResolvedValue({ result: 5, operation: 'add', operands: { a: 2.5, b: 2.5 } });
    const { user } = setup();

    await user.type(screen.getByLabelText('First number'), '2.5');
    await user.type(screen.getByLabelText('Second number'), '2.5{Enter}');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', a: 2.5, b: 2.5 });
  });

  it('rejects a comma instead of guessing what it means', async () => {
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('First number'), '1,000');
    await user.type(screen.getByLabelText('Second number'), '1');
    await user.tab();
    await user.click(screen.getByLabelText('First number'));
    await user.tab();

    expect(screen.getByText(/use digits and a dot/i)).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('hides the second operand for sqrt', async () => {
    calculateMock.mockResolvedValue({ result: 4, operation: 'sqrt', operands: { a: 16 } });
    const { user, submit } = setup();

    await user.click(screen.getByRole('radio', { name: /square root/i }));

    expect(screen.queryByLabelText('Second number')).not.toBeInTheDocument();
    expect(screen.getByText('Calculates the square root of the number.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Number'), '16');
    await user.click(submit());

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'sqrt', a: 16 });
    expect(await screen.findByText('√16 =')).toBeInTheDocument();
  });

  it('uses operation-specific field labels', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('radio', { name: /divide/i }));
    expect(screen.getByLabelText('Dividend')).toBeInTheDocument();
    expect(screen.getByLabelText('Divisor')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /power/i }));
    expect(screen.getByLabelText('Base')).toBeInTheDocument();
    expect(screen.getByLabelText('Exponent')).toBeInTheDocument();
  });

  it('shows validation errors after leaving a field and keeps submit disabled', async () => {
    const { user, submit } = setup();
    const first = screen.getByLabelText('First number');

    await user.type(first, 'abc');
    expect(screen.queryByText(/use digits and a dot/i)).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText(/use digits and a dot/i)).toBeInTheDocument();
    expect(first).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByLabelText('Second number'));
    await user.tab();
    expect(screen.getByText('Enter a number.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('shows a red error banner when the API rejects the calculation', async () => {
    calculateMock.mockRejectedValue(new api.ApiError('division by zero', 'DIVISION_BY_ZERO', 400));
    const { user, submit } = setup();

    await user.click(screen.getByRole('radio', { name: /divide/i }));
    await user.type(screen.getByLabelText('Dividend'), '1');
    await user.type(screen.getByLabelText('Divisor'), '0');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot divide by zero');
  });

  it('shows a spinner and disables submit while loading', async () => {
    let resolve: (value: CalculateSuccess) => void = () => undefined;
    calculateMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('First number'), '1');
    await user.type(screen.getByLabelText('Second number'), '2');
    await user.click(submit());

    expect(screen.getByRole('status')).toHaveTextContent('Calculating');
    expect(submit()).toBeDisabled();

    resolve({ result: 3, operation: 'add', operands: { a: 1, b: 2 } });
    expect(await screen.findByTestId('result-value')).toHaveTextContent('3');
  });

  it('clears fields and result', async () => {
    calculateMock.mockResolvedValue({ result: 3, operation: 'add', operands: { a: 1, b: 2 } });
    const { user, submit } = setup();

    await user.type(screen.getByLabelText('First number'), '1');
    await user.type(screen.getByLabelText('Second number'), '2');
    await user.click(submit());
    await screen.findByTestId('result-value');

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('First number')).toHaveValue('');
    expect(screen.getByLabelText('Second number')).toHaveValue('');
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
