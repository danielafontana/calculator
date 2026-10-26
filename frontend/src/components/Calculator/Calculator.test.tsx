import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../services/api';
import { Calculator } from './Calculator';

vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  calculate: vi.fn(),
  getOperations: vi.fn(),
}));

const calculateMock = vi.mocked(api.calculate);
const getOperationsMock = vi.mocked(api.getOperations);

const value = () => screen.getByTestId('result-value');

async function click(...names: string[]) {
  for (const name of names) {
    await userEvent.click(screen.getByRole('button', { name }));
  }
}

beforeEach(() => {
  getOperationsMock.mockRejectedValue(new api.ApiError('offline', 'NETWORK_ERROR'));
});

describe('<Calculator />', () => {
  it('renders the display and the keypad', () => {
    render(<Calculator />);

    expect(screen.getByRole('heading', { name: 'Calculator' })).toBeInTheDocument();
    expect(value()).toHaveTextContent('0');
    expect(screen.getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
  });

  it('calculates with the backend when "=" is pressed', async () => {
    calculateMock.mockResolvedValue({
      result: 1024,
      operation: 'power',
      operands: { a: 2, b: 10 },
    });
    render(<Calculator />);

    await click('2', 'Power');
    expect(screen.getByTestId('expression')).toHaveTextContent('2 ^');
    await click('1', '0', 'Equals');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'power', a: 2, b: 10 });
    await waitFor(() => {
      expect(value()).toHaveTextContent('1,024');
    });
    expect(screen.getByTestId('expression')).toHaveTextContent('2 ^ 10 =');
  });

  it('groups typed digits and keeps decimals', async () => {
    render(<Calculator />);

    await click('1', '2', '3', '4', 'Decimal point', '5', '0', 'Toggle sign');

    expect(value()).toHaveTextContent('-1,234.50');
  });

  it('shows a red banner when the backend rejects the calculation', async () => {
    calculateMock.mockRejectedValue(new api.ApiError('division by zero', 'DIVISION_BY_ZERO', 400));
    render(<Calculator />);

    await click('1', 'Divide', '0', 'Equals');

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot divide by zero');
    await click('Clear');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(value()).toHaveTextContent('0');
  });

  it('shows a spinner while the backend answers', async () => {
    let resolve: (v: Awaited<ReturnType<typeof api.calculate>>) => void = () => undefined;
    calculateMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<Calculator />);

    await click('9', 'Square root');
    expect(screen.getByRole('status')).toHaveTextContent('Calculating');

    resolve({ result: 3, operation: 'sqrt', operands: { a: 9 } });
    await waitFor(() => {
      expect(value()).toHaveTextContent('3');
    });
    expect(screen.getByTestId('expression')).toHaveTextContent('√(9)');
  });

  it('accepts the physical keyboard', async () => {
    calculateMock.mockResolvedValue({
      result: 30,
      operation: 'percentage',
      operands: { a: 200, b: 15 },
    });
    render(<Calculator />);

    await userEvent.keyboard('200%15{Enter}');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'percentage', a: 200, b: 15 });
    await waitFor(() => {
      expect(value()).toHaveTextContent('30');
    });
    expect(screen.getByTestId('expression')).toHaveTextContent('15% of 200 =');
  });

  it('disables keys for operations the backend does not offer', async () => {
    getOperationsMock.mockResolvedValue([
      { name: 'add', symbol: '+', description: 'Sum', operands: 2 },
    ]);
    render(<Calculator />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Divide' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });
});
