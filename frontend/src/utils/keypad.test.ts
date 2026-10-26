import { describe, expect, it } from 'vitest';

import {
  MAX_DIGITS,
  applyResult,
  applyUnaryResult,
  backspace,
  clearEntry,
  displayValue,
  initialState,
  inputDecimal,
  inputDigit,
  isDigit,
  pressEquals,
  pressOperator,
  pressUnary,
  toggleSign,
  type KeypadState,
} from './keypad';

/** Types a number key by key, e.g. type(initialState, "12.5"). */
function type(state: KeypadState, keys: string): KeypadState {
  let s = state;
  for (const k of keys) s = k === '.' ? inputDecimal(s) : inputDigit(s, k);
  return s;
}

describe('number entry', () => {
  it('replaces the leading zero and appends digits', () => {
    expect(type(initialState, '012').entry).toBe('12');
  });

  it('accepts a single decimal point', () => {
    expect(type(initialState, '.5.2').entry).toBe('0.52');
  });

  it(`stops at ${String(MAX_DIGITS)} digits`, () => {
    const s = type(initialState, '1'.repeat(MAX_DIGITS + 3));
    expect(s.entry).toHaveLength(MAX_DIGITS);
  });

  it('toggles the sign, but not of a plain zero', () => {
    expect(toggleSign(initialState)).toBe(initialState);
    const negative = toggleSign(type(initialState, '5'));
    expect(negative.entry).toBe('-5');
    expect(toggleSign(negative).entry).toBe('5');
    expect(toggleSign(type(initialState, '0.')).entry).toBe('-0.');
    expect(inputDigit({ ...initialState, entry: '-0' }, '7').entry).toBe('-7');
  });

  it('backspace removes the last character and falls back to zero', () => {
    expect(backspace(type(initialState, '12')).entry).toBe('1');
    expect(backspace(type(initialState, '1')).entry).toBe('0');
    expect(backspace(toggleSign(type(initialState, '7'))).entry).toBe('0');
  });

  it('backspace does not edit a result', () => {
    const result = applyResult(initialState, 42, null);
    expect(backspace(result)).toBe(result);
  });
});

describe('operators', () => {
  it('stores the left operand and shows the pending expression', () => {
    const { state, request } = pressOperator(type(initialState, '12'), 'multiply');
    expect(request).toBeUndefined();
    expect(state).toMatchObject({
      stored: 12,
      operator: 'multiply',
      overwrite: true,
      expression: '12 ×',
    });
  });

  it('swaps the operator when no right operand was typed', () => {
    const first = pressOperator(type(initialState, '12'), 'multiply').state;
    const { state, request } = pressOperator(first, 'subtract');
    expect(request).toBeUndefined();
    expect(state).toMatchObject({ stored: 12, operator: 'subtract', expression: '12 −' });
  });

  it('starts the right operand on the next digit, keeping the pending expression', () => {
    const pending = pressOperator(type(initialState, '12'), 'add').state;
    expect(type(pending, '3')).toMatchObject({ entry: '3', expression: '12 +', overwrite: false });
    expect(inputDecimal(pending)).toMatchObject({ entry: '0.', expression: '12 +' });
  });

  it('chains: a pending operation is computed before the next operator', () => {
    const typed = type(pressOperator(type(initialState, '2'), 'add').state, '3');
    const { request } = pressOperator(typed, 'multiply');
    expect(request).toEqual({ operation: 'add', a: 2, b: 3 });

    const next = applyResult(typed, 5, 'multiply');
    expect(next).toMatchObject({ entry: '5', stored: 5, operator: 'multiply', expression: '5 ×' });
  });

  it('CE clears only the value being typed', () => {
    const typed = type(pressOperator(type(initialState, '9'), 'divide').state, '4');
    expect(clearEntry(typed)).toMatchObject({
      entry: '0',
      stored: 9,
      operator: 'divide',
      expression: '9 ÷',
    });
  });
});

describe('equals', () => {
  it('does nothing without a pending operation', () => {
    const s = type(initialState, '5');
    expect(pressEquals(s)).toEqual({ state: s });
  });

  it('requests the pending operation and shows the full expression', () => {
    const typed = type(pressOperator(type(initialState, '12'), 'divide').state, '4');
    expect(pressEquals(typed).request).toEqual({ operation: 'divide', a: 12, b: 4 });

    const done = applyResult(typed, 3, null);
    expect(done).toMatchObject({
      entry: '3',
      stored: null,
      operator: null,
      overwrite: true,
      expression: '12 ÷ 4 =',
    });
  });

  it('reuses the left operand when no right operand was typed', () => {
    const pending = pressOperator(type(initialState, '7'), 'multiply').state;
    expect(pressEquals(pending).request).toEqual({ operation: 'multiply', a: 7, b: 7 });
  });

  it('formats percentage and power expressions', () => {
    const pct = type(pressOperator(type(initialState, '200'), 'percentage').state, '15');
    expect(applyResult(pct, 30, null).expression).toBe('15% of 200 =');
    const pow = type(pressOperator(type(initialState, '2'), 'power').state, '10');
    expect(applyResult(pow, 1024, null).expression).toBe('2 ^ 10 =');
  });

  it('a new digit after a result starts over', () => {
    const done = applyResult(
      type(pressOperator(type(initialState, '1'), 'add').state, '1'),
      2,
      null,
    );
    expect(inputDigit(done, '9')).toMatchObject({ entry: '9', expression: '', overwrite: false });
  });

  it('an operator after a result continues from it', () => {
    const done = applyResult(initialState, 42, null);
    expect(pressOperator(done, 'add').state).toMatchObject({
      stored: 42,
      operator: 'add',
      expression: '42 +',
    });
  });
});

describe('unary keys', () => {
  it('requests sqrt and square (power of 2) for the displayed value', () => {
    const s = type(initialState, '9');
    expect(pressUnary(s, 'sqrt').request).toEqual({ operation: 'sqrt', a: 9 });
    expect(pressUnary(s, 'square').request).toEqual({ operation: 'power', a: 9, b: 2 });
  });

  it('shows the applied function and keeps the result as the operand', () => {
    expect(applyUnaryResult(type(initialState, '9'), 'sqrt', 3)).toMatchObject({
      entry: '3',
      overwrite: true,
      hasOperand: true,
      expression: '√(9)',
    });
    expect(applyUnaryResult(type(initialState, '4'), 'square', 16).expression).toBe('sqr(4)');
  });

  it('works as the right operand of a pending operation', () => {
    const pending = type(pressOperator(type(initialState, '12'), 'add').state, '9');
    const applied = applyUnaryResult(pending, 'sqrt', 3);
    expect(applied.expression).toBe('12 + √(9)');
    expect(pressEquals(applied).request).toEqual({ operation: 'add', a: 12, b: 3 });
    expect(pressOperator(applied, 'subtract').request).toEqual({ operation: 'add', a: 12, b: 3 });
  });
});

describe('displayValue', () => {
  it.each([
    ['0', '0'],
    ['1234', '1,234'],
    ['-1234567.50', '-1,234,567.50'],
    ['0.', '0.'],
    ['-0.', '-0.'],
  ])('shows typed %s as %s', (entry, shown) => {
    expect(displayValue({ ...initialState, entry })).toBe(shown);
  });

  it('formats results', () => {
    expect(displayValue(applyResult(initialState, 0.1 + 0.2, null))).toBe('0.3');
    expect(displayValue(applyResult(initialState, 1e21, null))).toBe('1e+21');
  });
});

describe('isDigit', () => {
  it('recognizes digit keys only', () => {
    expect(isDigit('7')).toBe(true);
    expect(isDigit('decimal')).toBe(false);
    expect(isDigit('add')).toBe(false);
  });
});
