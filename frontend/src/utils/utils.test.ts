import { describe, expect, it } from 'vitest';

import { ApiError } from '../services/api';
import { OPERATIONS, isCalculateFailure, isOperation } from '../types/calculator';
import { errorMessage, toApiError } from './errors';
import { formatNumber } from './format';
import { formatExpression, isUnary } from './operations';
import { parseNumber, validateForm } from './validation';

describe('parseNumber', () => {
  it.each([
    ['10', 10],
    ['-3', -3],
    ['+4', 4],
    ['2.5', 2.5],
    ['2,5', 2.5],
    ['.5', 0.5],
    [',5', 0.5],
    ['5.', 5],
    ['1e6', 1e6],
    ['-1.5E-3', -0.0015],
    ['  7  ', 7],
  ])('parses %j as %d', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '1,000.5', '1.2.3', '--1', '1e', 'Infinity', 'NaN', '0x10', '1e400'])(
    'rejects %j',
    (input) => {
      expect(parseNumber(input)).toBeNull();
    },
  );
});

describe('validateForm', () => {
  it('builds a binary request', () => {
    expect(validateForm({ operation: 'add', a: '1', b: '2' })).toEqual({
      valid: true,
      request: { operation: 'add', a: 1, b: 2 },
      errors: {},
    });
  });

  it('ignores b for sqrt', () => {
    expect(validateForm({ operation: 'sqrt', a: '9', b: 'garbage' })).toEqual({
      valid: true,
      request: { operation: 'sqrt', a: 9 },
      errors: {},
    });
  });

  it('reports required and invalid fields', () => {
    expect(validateForm({ operation: 'divide', a: '', b: 'x' })).toEqual({
      valid: false,
      errors: { a: 'required', b: 'invalid' },
    });
    expect(validateForm({ operation: 'sqrt', a: 'x', b: '' })).toEqual({
      valid: false,
      errors: { a: 'invalid' },
    });
  });
});

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [15, '15'],
    [-2.5, '-2,5'],
    [1234567.891, '1.234.567,891'],
    [0.1 + 0.2, '0,3'],
    [1e20, '1e+20'],
    [-1.5e-7, '-1,5e-7'],
    [123456789012345680, '1,23456789e+17'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('stringifies non-finite values', () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });
});

describe('operations', () => {
  it('formats expressions for each operation', () => {
    expect(formatExpression('add', 1, 2)).toBe('1 + 2');
    expect(formatExpression('subtract', 1, 2)).toBe('1 − 2');
    expect(formatExpression('multiply', 1, 2)).toBe('1 × 2');
    expect(formatExpression('divide', 1, 2)).toBe('1 ÷ 2');
    expect(formatExpression('power', 2, 10)).toBe('2 ^ 10');
    expect(formatExpression('sqrt', 16)).toBe('√16');
    expect(formatExpression('percentage', 200, 15)).toBe('15% de 200');
  });

  it('marks only sqrt as unary', () => {
    expect(OPERATIONS.filter(isUnary)).toEqual(['sqrt']);
  });
});

describe('type guards', () => {
  it('isOperation', () => {
    expect(isOperation('add')).toBe(true);
    expect(isOperation('modulo')).toBe(false);
    expect(isOperation(1)).toBe(false);
  });

  it('isCalculateFailure discriminates the response union', () => {
    expect(isCalculateFailure({ error: 'x', code: 'OVERFLOW' })).toBe(true);
    expect(isCalculateFailure({ result: 1, operation: 'add', operands: { a: 1 } })).toBe(false);
  });
});

describe('errors', () => {
  it('has a message for every code', () => {
    expect(errorMessage('DIVISION_BY_ZERO')).toMatch(/dividir por zero/);
    expect(errorMessage('NETWORK_ERROR')).toMatch(/conexão/);
    expect(errorMessage('RATE_LIMITED')).toMatch(/aguarde/i);
  });

  it('toApiError keeps ApiError and wraps anything else', () => {
    const apiError = new ApiError('x', 'TIMEOUT');
    expect(toApiError(apiError)).toBe(apiError);
    expect(toApiError(new Error('boom'))).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      message: 'boom',
    });
    expect(toApiError('weird')).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      message: 'Erro desconhecido.',
    });
  });
});
