import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../services/api';
import { ResultDisplay } from './ResultDisplay';

describe('<ResultDisplay />', () => {
  it('shows a placeholder when idle', () => {
    render(<ResultDisplay result={null} error={null} loading={false} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a spinner while loading', () => {
    render(<ResultDisplay result={null} error={null} loading />);

    expect(screen.getByRole('status')).toHaveTextContent('Calculating…');
    expect(screen.getByRole('region', { name: 'Result' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the formatted result with its expression', () => {
    render(
      <ResultDisplay
        result={{ result: 1234.5, operation: 'multiply', operands: { a: 2469, b: 0.5 } }}
        error={null}
        loading={false}
      />,
    );

    expect(screen.getByTestId('result-value')).toHaveTextContent('1,234.5');
    expect(screen.getByText('2,469 × 0.5 =')).toBeInTheDocument();
  });

  it('shows an error banner with a user-facing message', () => {
    render(
      <ResultDisplay
        result={null}
        error={new ApiError('square root of a negative number', 'NEGATIVE_SQRT', 400)}
        loading={false}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not calculate');
    expect(alert).toHaveTextContent('Negative numbers have no real square root');
  });

  it('prioritizes loading over a previous error', () => {
    render(<ResultDisplay result={null} error={new ApiError('x', 'TIMEOUT')} loading />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
