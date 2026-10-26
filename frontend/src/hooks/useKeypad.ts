import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiError } from '../services/api';
import type { Operation } from '../types/calculator';
import {
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
  type BinaryOperation,
  type KeyId,
  type KeypadState,
  type Step,
} from '../utils/keypad';
import { useCalculator } from './useCalculator';
import { useOperations } from './useOperations';

/** Physical keyboard shortcuts (same as the Windows calculator where possible). */
export const KEYBOARD_SHORTCUTS: Readonly<Record<string, KeyId>> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '.': 'decimal',
  ',': 'decimal',
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
  '%': 'percentage',
  '@': 'sqrt',
  q: 'square',
  F9: 'negate',
  Enter: 'equals',
  '=': 'equals',
  Backspace: 'backspace',
  Delete: 'clearEntry',
  Escape: 'clear',
};

/** Operation each API-backed key needs from the backend. */
const REQUIRED_OPERATION: Partial<Record<KeyId, Operation>> = {
  add: 'add',
  subtract: 'subtract',
  multiply: 'multiply',
  divide: 'divide',
  power: 'power',
  percentage: 'percentage',
  sqrt: 'sqrt',
  square: 'power',
};

export interface UseKeypad {
  /** Main number on the display. */
  value: string;
  /** Secondary line, e.g. "12 ×". */
  expression: string;
  error: ApiError | null;
  loading: boolean;
  /** Operator waiting for its right operand, if any. */
  operator: BinaryOperation | null;
  isAvailable: (key: KeyId) => boolean;
  press: (key: KeyId) => void;
}

/**
 * Drives the keypad: applies the pure transitions from utils/keypad, sends
 * calculations to the API through useCalculator and listens to the physical
 * keyboard. Input is ignored while a calculation is in flight.
 */
export function useKeypad(): UseKeypad {
  const operations = useOperations();
  const { calculate, reset, error, loading } = useCalculator();
  const [state, setState] = useState<KeypadState>(initialState);
  const stateRef = useRef(state);
  const busy = useRef(false);

  const commit = useCallback((next: KeypadState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const isAvailable = useCallback(
    (key: KeyId) => {
      const required = REQUIRED_OPERATION[key];
      return required === undefined || operations.includes(required);
    },
    [operations],
  );

  const run = useCallback(
    async (step: Step, onResult: (s: KeypadState, result: number) => KeypadState) => {
      commit(step.state);
      if (!step.request) return;
      busy.current = true;
      try {
        const data = await calculate(step.request);
        if (data) commit(onResult(step.state, data.result));
      } finally {
        busy.current = false;
      }
    },
    [calculate, commit],
  );

  const press = useCallback(
    (key: KeyId) => {
      if (busy.current || !isAvailable(key)) return;

      let s = stateRef.current;
      if (error) {
        // After an error the display restarts; only a number continues it.
        reset();
        s = initialState;
        if (!isDigit(key) && key !== 'decimal') {
          commit(s);
          return;
        }
      }

      if (isDigit(key)) {
        commit(inputDigit(s, key));
        return;
      }
      switch (key) {
        case 'decimal':
          commit(inputDecimal(s));
          break;
        case 'negate':
          commit(toggleSign(s));
          break;
        case 'backspace':
          commit(backspace(s));
          break;
        case 'clearEntry':
          commit(clearEntry(s));
          break;
        case 'clear':
          reset();
          commit(initialState);
          break;
        case 'equals':
          void run(pressEquals(s), (st, r) => applyResult(st, r, null));
          break;
        case 'sqrt':
        case 'square':
          void run(pressUnary(s, key), (st, r) => applyUnaryResult(st, key, r));
          break;
        default:
          void run(pressOperator(s, key), (st, r) => applyResult(st, r, key));
      }
    },
    [commit, error, isAvailable, reset, run],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = KEYBOARD_SHORTCUTS[event.key];
      if (key === undefined) return;
      // Also stops Enter from activating a focused key a second time.
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [press]);

  return {
    value: displayValue(state),
    expression: state.expression,
    error,
    loading,
    operator: state.operator,
    isAvailable,
    press,
  };
}
