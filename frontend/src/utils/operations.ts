import type { Operation } from '../types/calculator';
import { formatNumber } from './format';

export interface OperationMeta {
  /** Accessible name of the operation's key. */
  label: string;
  /** Symbol used in the expression line, e.g. "12 ×". */
  symbol: string;
}

export const OPERATION_META: Record<Operation, OperationMeta> = {
  add: { label: 'Add', symbol: '+' },
  subtract: { label: 'Subtract', symbol: '−' },
  multiply: { label: 'Multiply', symbol: '×' },
  divide: { label: 'Divide', symbol: '÷' },
  power: { label: 'Power', symbol: '^' },
  sqrt: { label: 'Square root', symbol: '√' },
  percentage: { label: 'Percentage', symbol: '%' },
};

/** Human readable expression, e.g. "10 + 5", "√16" or "15% of 200". */
export function formatExpression(operation: Operation, a: number, b?: number): string {
  const fa = formatNumber(a);
  const fb = b === undefined ? '' : formatNumber(b);
  switch (operation) {
    case 'sqrt':
      return `√${fa}`;
    case 'power':
      return `${fa} ^ ${fb}`;
    case 'percentage':
      return `${fb}% of ${fa}`;
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
      return `${fa} ${OPERATION_META[operation].symbol} ${fb}`;
  }
}
