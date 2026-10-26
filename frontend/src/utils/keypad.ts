import type { CalculateRequest, Operation } from '../types/calculator';
import { formatNumber } from './format';
import { OPERATION_META, formatExpression } from './operations';

/**
 * Keypad state machine, kept free of React and I/O so every key sequence can
 * be unit tested. Arithmetic is never done here: keys that need a result
 * return a CalculateRequest for the API, and the caller feeds the response
 * back with applyResult/applyUnaryResult.
 */

/** Operators entered as "a op b =". */
export type BinaryOperation = Exclude<Operation, 'sqrt'>;

/** Keys that act on the displayed value immediately. */
export type UnaryKey = 'sqrt' | 'square';

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** Every key of the keypad. */
export type KeyId =
  | Digit
  | BinaryOperation
  | UnaryKey
  | 'decimal'
  | 'negate'
  | 'backspace'
  | 'clear'
  | 'clearEntry'
  | 'equals';

export function isDigit(key: KeyId): key is Digit {
  return /^[0-9]$/.test(key);
}

/** Longest number that can be typed (digits only). */
export const MAX_DIGITS = 16;

export interface KeypadState {
  /** Number being typed, or the last result as a plain JavaScript number string. */
  entry: string;
  /** Left operand waiting for the right one. */
  stored: number | null;
  /** Operator waiting for its right operand. */
  operator: BinaryOperation | null;
  /** The next digit starts a new number instead of appending to entry. */
  overwrite: boolean;
  /** entry holds a right operand the user provided (typed or computed). */
  hasOperand: boolean;
  /** Secondary line above the value, e.g. "12 ×" or "12 × 3 =". */
  expression: string;
}

export const initialState: KeypadState = {
  entry: '0',
  stored: null,
  operator: null,
  overwrite: false,
  hasOperand: true,
  expression: '',
};

/** A key press that needs the API, plus how to continue once it answers. */
export interface Step {
  state: KeypadState;
  request?: CalculateRequest;
}

const digitCount = (entry: string) => entry.replace(/[^0-9]/g, '').length;

function pendingExpression(s: KeypadState): string {
  return s.operator && s.stored !== null
    ? `${formatNumber(s.stored)} ${OPERATION_META[s.operator].symbol}`
    : '';
}

export function inputDigit(s: KeypadState, digit: string): KeypadState {
  if (s.overwrite) {
    return {
      ...s,
      entry: digit,
      overwrite: false,
      hasOperand: true,
      expression: pendingExpression(s),
    };
  }
  if (s.entry === '0') return { ...s, entry: digit, hasOperand: true };
  if (s.entry === '-0') return { ...s, entry: `-${digit}`, hasOperand: true };
  if (digitCount(s.entry) >= MAX_DIGITS) return s;
  return { ...s, entry: s.entry + digit, hasOperand: true };
}

export function inputDecimal(s: KeypadState): KeypadState {
  if (s.overwrite) {
    return {
      ...s,
      entry: '0.',
      overwrite: false,
      hasOperand: true,
      expression: pendingExpression(s),
    };
  }
  if (s.entry.includes('.')) return s;
  return { ...s, entry: `${s.entry}.`, hasOperand: true };
}

export function toggleSign(s: KeypadState): KeypadState {
  if (Number(s.entry) === 0 && !s.entry.includes('.')) return s;
  const entry = s.entry.startsWith('-') ? s.entry.slice(1) : `-${s.entry}`;
  return { ...s, entry, hasOperand: true };
}

/** Removes the last typed character; results cannot be edited. */
export function backspace(s: KeypadState): KeypadState {
  if (s.overwrite) return s;
  const entry = s.entry.slice(0, -1);
  return { ...s, entry: entry === '' || entry === '-' ? '0' : entry };
}

/** CE: clears the value being typed, keeping the pending operation. */
export function clearEntry(s: KeypadState): KeypadState {
  return { ...s, entry: '0', overwrite: false, hasOperand: true, expression: pendingExpression(s) };
}

/**
 * Binary operator key. With a pending "a op b" it first asks the API for the
 * result (chaining, as in "2 + 3 ×" → 5); otherwise it stores the value, or
 * just swaps the operator if no right operand was entered yet.
 */
export function pressOperator(s: KeypadState, op: BinaryOperation): Step {
  if (s.operator && s.stored !== null && s.hasOperand) {
    return { state: s, request: request(s.operator, s.stored, Number(s.entry)) };
  }
  const stored = s.operator && s.stored !== null ? s.stored : Number(s.entry);
  const next = { ...s, stored, operator: op, overwrite: true, hasOperand: false };
  return { state: { ...next, expression: pendingExpression(next) } };
}

/** "=": computes the pending operation; "a op =" reuses a as the right operand. */
export function pressEquals(s: KeypadState): Step {
  if (!s.operator || s.stored === null) return { state: s };
  return { state: s, request: request(s.operator, s.stored, Number(s.entry)) };
}

/** √x and x² act on the displayed value right away. */
export function pressUnary(s: KeypadState, key: UnaryKey): Step {
  const a = Number(s.entry);
  return {
    state: s,
    request: key === 'sqrt' ? { operation: 'sqrt', a } : { operation: 'power', a, b: 2 },
  };
}

/**
 * Applies the API result of pressOperator/pressEquals. `next` is the operator
 * that triggered a chained calculation, or null for "=".
 */
export function applyResult(
  s: KeypadState,
  result: number,
  next: BinaryOperation | null,
): KeypadState {
  const entry = String(result);
  if (next) {
    const state = {
      ...s,
      entry,
      stored: result,
      operator: next,
      overwrite: true,
      hasOperand: false,
    };
    return { ...state, expression: pendingExpression(state) };
  }
  const expression =
    s.operator && s.stored !== null
      ? `${formatExpression(s.operator, s.stored, Number(s.entry))} =`
      : s.expression;
  return { ...initialState, entry, overwrite: true, expression };
}

/** Applies the API result of pressUnary, e.g. "12 + √(9)" with 3 as the operand. */
export function applyUnaryResult(s: KeypadState, key: UnaryKey, result: number): KeypadState {
  const operand = formatNumber(Number(s.entry));
  const applied = key === 'sqrt' ? `√(${operand})` : `sqr(${operand})`;
  const prefix = pendingExpression(s);
  return {
    ...s,
    entry: String(result),
    overwrite: true,
    hasOperand: true,
    expression: prefix ? `${prefix} ${applied}` : applied,
  };
}

/** Value shown on the display: typed numbers keep their trailing zeros and dot. */
export function displayValue(s: KeypadState): string {
  if (s.overwrite || /e/i.test(s.entry)) return formatNumber(Number(s.entry));
  const negative = s.entry.startsWith('-');
  const [int = '0', frac] = (negative ? s.entry.slice(1) : s.entry).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac === undefined ? '' : `.${frac}`}`;
}

function request(op: BinaryOperation, a: number, b: number): CalculateRequest {
  return { operation: op, a, b };
}
