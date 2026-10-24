import type { Operation } from '../types/calculator';
import { formatNumber } from './format';

export interface OperationMeta {
  label: string;
  symbol: string;
  description: string;
  /** Field labels for a and, for binary operations, b. */
  operandLabels: readonly [string] | readonly [string, string];
}

export const OPERATION_META: Record<Operation, OperationMeta> = {
  add: {
    label: 'Add',
    symbol: '+',
    description: 'Adds the two numbers.',
    operandLabels: ['First number', 'Second number'],
  },
  subtract: {
    label: 'Subtract',
    symbol: '−',
    description: 'Subtracts the second number from the first.',
    operandLabels: ['First number', 'Second number'],
  },
  multiply: {
    label: 'Multiply',
    symbol: '×',
    description: 'Multiplies the two numbers.',
    operandLabels: ['First number', 'Second number'],
  },
  divide: {
    label: 'Divide',
    symbol: '÷',
    description: 'Divides the dividend by the divisor.',
    operandLabels: ['Dividend', 'Divisor'],
  },
  power: {
    label: 'Power',
    symbol: 'xʸ',
    description: 'Raises the base to the exponent.',
    operandLabels: ['Base', 'Exponent'],
  },
  sqrt: {
    label: 'Square root',
    symbol: '√',
    description: 'Calculates the square root of the number.',
    operandLabels: ['Number'],
  },
  percentage: {
    label: 'Percentage',
    symbol: '%',
    description: 'Calculates the given percent of the value.',
    operandLabels: ['Value', 'Percent'],
  },
};

export function isUnary(operation: Operation): boolean {
  return OPERATION_META[operation].operandLabels.length === 1;
}

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
