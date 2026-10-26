import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Keypad } from './Keypad';
import { KEYS } from './keys';

const always = () => true;

describe('<Keypad />', () => {
  it('renders digits 0-9 and the function keys with accessible names', () => {
    render(<Keypad onKey={vi.fn()} isAvailable={always} activeOperator={null} />);

    const keypad = screen.getByRole('group', { name: 'Keypad' });
    expect(keypad.querySelectorAll('button')).toHaveLength(KEYS.length);
    for (const digit of '0123456789') {
      expect(screen.getByRole('button', { name: digit })).toBeInTheDocument();
    }
    for (const name of [
      'Add',
      'Subtract',
      'Multiply',
      'Divide',
      'Power',
      'Square',
      'Square root',
      'Percentage',
      'Equals',
      'Clear',
      'Clear entry',
      'Backspace',
      'Toggle sign',
      'Decimal point',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows only icons on function keys', () => {
    render(<Keypad onKey={vi.fn()} isAvailable={always} activeOperator={null} />);

    expect(screen.getByRole('button', { name: 'Divide' })).toHaveTextContent('÷');
    expect(screen.getByRole('button', { name: 'Square root' })).toHaveTextContent('√x');
  });

  it('reports the pressed key', async () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} isAvailable={always} activeOperator={null} />);

    await userEvent.click(screen.getByRole('button', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Multiply' }));

    expect(onKey.mock.calls).toEqual([['7'], ['multiply']]);
  });

  it('marks the pending operator as pressed', () => {
    render(<Keypad onKey={vi.fn()} isAvailable={always} activeOperator="multiply" />);

    expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '7' })).not.toHaveAttribute('aria-pressed');
  });

  it('disables unavailable keys', () => {
    render(<Keypad onKey={vi.fn()} isAvailable={(key) => key !== 'power'} activeOperator={null} />);

    expect(screen.getByRole('button', { name: 'Power' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });
});
