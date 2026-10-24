import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NumberField } from './NumberField';

describe('<NumberField />', () => {
  it('is labelled and reports changes', async () => {
    const onChange = vi.fn();
    render(<NumberField label="Base" value="" onChange={onChange} />);

    const input = screen.getByLabelText('Base');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    await userEvent.type(input, '7');

    expect(onChange).toHaveBeenCalledWith('7');
  });

  it('links the error message to the input', () => {
    render(<NumberField label="Base" value="x" onChange={vi.fn()} error="Invalid value" />);

    const input = screen.getByLabelText('Base');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Invalid value');
  });

  it('calls onBlur', async () => {
    const onBlur = vi.fn();
    render(<NumberField label="Base" value="" onChange={vi.fn()} onBlur={onBlur} />);

    await userEvent.click(screen.getByLabelText('Base'));
    await userEvent.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
