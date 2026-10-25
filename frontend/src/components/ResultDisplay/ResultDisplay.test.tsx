import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../services/api';
import { ResultDisplay } from './ResultDisplay';

describe('<ResultDisplay />', () => {
  it('shows the value and the expression', () => {
    render(<ResultDisplay value="1,024" expression="2 ^ 10 =" error={null} loading={false} />);

    expect(screen.getByTestId('result-value')).toHaveTextContent('1,024');
    expect(screen.getByTestId('expression')).toHaveTextContent('2 ^ 10 =');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shrinks long values', () => {
    const { rerender } = render(
      <ResultDisplay value="12" expression="" error={null} loading={false} />,
    );
    expect(screen.getByTestId('result-value')).toHaveAttribute('data-size', 'large');

    rerender(<ResultDisplay value="123,456,789" expression="" error={null} loading={false} />);
    expect(screen.getByTestId('result-value')).toHaveAttribute('data-size', 'medium');

    rerender(
      <ResultDisplay value="1,234,567,890,123,456" expression="" error={null} loading={false} />,
    );
    expect(screen.getByTestId('result-value')).toHaveAttribute('data-size', 'small');
  });

  it('shows a spinner while loading', () => {
    render(<ResultDisplay value="5" expression="2 + 3" error={null} loading />);

    expect(screen.getByRole('status')).toHaveTextContent('Calculating…');
    expect(screen.getByRole('region', { name: 'Result' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error banner instead of the value', () => {
    render(
      <ResultDisplay
        value="1"
        expression="1 ÷"
        error={new ApiError('division by zero', 'DIVISION_BY_ZERO', 400)}
        loading={false}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not calculate');
    expect(alert).toHaveTextContent('Cannot divide by zero');
    expect(screen.queryByTestId('result-value')).not.toBeInTheDocument();
  });
});
