import type { KeyId } from '../../utils/keypad';

export type KeyKind = 'digit' | 'function' | 'operator' | 'equals';

export interface KeyDef {
  id: KeyId;
  /** What the key shows. */
  icon: string;
  /** Accessible name, since most keys only show a symbol. */
  label: string;
  kind: KeyKind;
  /** Binary operators stay highlighted while waiting for the right operand. */
  toggles?: boolean;
}

/** Keypad layout, row by row (4 columns), as on a standard desktop calculator. */
export const KEYS: readonly KeyDef[] = [
  { id: 'percentage', icon: '%', label: 'Percentage', kind: 'function', toggles: true },
  { id: 'clearEntry', icon: 'CE', label: 'Clear entry', kind: 'function' },
  { id: 'clear', icon: 'C', label: 'Clear', kind: 'function' },
  { id: 'backspace', icon: '⌫', label: 'Backspace', kind: 'function' },

  { id: 'square', icon: 'x²', label: 'Square', kind: 'function' },
  { id: 'power', icon: 'xʸ', label: 'Power', kind: 'function', toggles: true },
  { id: 'sqrt', icon: '√x', label: 'Square root', kind: 'function' },
  { id: 'divide', icon: '÷', label: 'Divide', kind: 'operator', toggles: true },

  { id: '7', icon: '7', label: '7', kind: 'digit' },
  { id: '8', icon: '8', label: '8', kind: 'digit' },
  { id: '9', icon: '9', label: '9', kind: 'digit' },
  { id: 'multiply', icon: '×', label: 'Multiply', kind: 'operator', toggles: true },

  { id: '4', icon: '4', label: '4', kind: 'digit' },
  { id: '5', icon: '5', label: '5', kind: 'digit' },
  { id: '6', icon: '6', label: '6', kind: 'digit' },
  { id: 'subtract', icon: '−', label: 'Subtract', kind: 'operator', toggles: true },

  { id: '1', icon: '1', label: '1', kind: 'digit' },
  { id: '2', icon: '2', label: '2', kind: 'digit' },
  { id: '3', icon: '3', label: '3', kind: 'digit' },
  { id: 'add', icon: '+', label: 'Add', kind: 'operator', toggles: true },

  { id: 'negate', icon: '±', label: 'Toggle sign', kind: 'digit' },
  { id: '0', icon: '0', label: '0', kind: 'digit' },
  { id: 'decimal', icon: '.', label: 'Decimal point', kind: 'digit' },
  { id: 'equals', icon: '=', label: 'Equals', kind: 'equals' },
];
