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
    label: 'Somar',
    symbol: '+',
    description: 'Soma os dois números.',
    operandLabels: ['Primeiro número', 'Segundo número'],
  },
  subtract: {
    label: 'Subtrair',
    symbol: '−',
    description: 'Subtrai o segundo número do primeiro.',
    operandLabels: ['Primeiro número', 'Segundo número'],
  },
  multiply: {
    label: 'Multiplicar',
    symbol: '×',
    description: 'Multiplica os dois números.',
    operandLabels: ['Primeiro número', 'Segundo número'],
  },
  divide: {
    label: 'Dividir',
    symbol: '÷',
    description: 'Divide o dividendo pelo divisor.',
    operandLabels: ['Dividendo', 'Divisor'],
  },
  power: {
    label: 'Potência',
    symbol: 'xʸ',
    description: 'Eleva a base ao expoente.',
    operandLabels: ['Base', 'Expoente'],
  },
  sqrt: {
    label: 'Raiz',
    symbol: '√',
    description: 'Calcula a raiz quadrada do número.',
    operandLabels: ['Número'],
  },
  percentage: {
    label: 'Porcentagem',
    symbol: '%',
    description: 'Calcula quanto é o percentual do valor.',
    operandLabels: ['Valor', 'Percentual'],
  },
};

export function isUnary(operation: Operation): boolean {
  return OPERATION_META[operation].operandLabels.length === 1;
}

/** Human readable expression, e.g. "10 + 5", "√16" or "15% de 200". */
export function formatExpression(operation: Operation, a: number, b?: number): string {
  const fa = formatNumber(a);
  const fb = b === undefined ? '' : formatNumber(b);
  switch (operation) {
    case 'sqrt':
      return `√${fa}`;
    case 'power':
      return `${fa} ^ ${fb}`;
    case 'percentage':
      return `${fb}% de ${fa}`;
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
      return `${fa} ${OPERATION_META[operation].symbol} ${fb}`;
  }
}
