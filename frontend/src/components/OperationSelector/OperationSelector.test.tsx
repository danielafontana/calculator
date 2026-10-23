import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OPERATIONS } from '../../types/calculator';
import { OperationSelector } from './OperationSelector';

describe('<OperationSelector />', () => {
  it('renders one radio per operation inside a labelled group', () => {
    render(<OperationSelector value="add" onChange={vi.fn()} operations={OPERATIONS} />);

    expect(screen.getByRole('group', { name: 'Operação' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(OPERATIONS.length);
  });

  it('checks the current value', () => {
    render(<OperationSelector value="divide" onChange={vi.fn()} operations={OPERATIONS} />);

    expect(screen.getByRole('radio', { name: /dividir/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /somar/i })).not.toBeChecked();
  });

  it('calls onChange with the chosen operation', async () => {
    const onChange = vi.fn();
    render(<OperationSelector value="add" onChange={onChange} operations={OPERATIONS} />);

    await userEvent.click(screen.getByRole('radio', { name: /porcentagem/i }));

    expect(onChange).toHaveBeenCalledWith('percentage');
  });

  it('supports keyboard selection', async () => {
    const onChange = vi.fn();
    render(<OperationSelector value="add" onChange={onChange} operations={OPERATIONS} />);

    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /somar/i })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('subtract');
  });

  it('renders only the given operations', () => {
    render(<OperationSelector value="sqrt" onChange={vi.fn()} operations={['sqrt', 'power']} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('can be disabled', () => {
    render(<OperationSelector value="add" onChange={vi.fn()} operations={OPERATIONS} disabled />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });
});
