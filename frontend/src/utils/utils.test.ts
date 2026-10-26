import { describe, expect, it } from 'vitest';

import { ApiError } from '../services/api';
import { isCalculateFailure, isOperation } from '../types/calculator';
import { errorMessage, toApiError } from './errors';
import { formatNumber } from './format';
import { formatExpression } from './operations';

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [15, '15'],
    [-2.5, '-2.5'],
    [1234567.891, '1,234,567.891'],
    [0.1 + 0.2, '0.3'],
    [1e20, '1e+20'],
    [-1.5e-7, '-1.5e-7'],
    [123456789012345680, '1.23456789e+17'],
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
    expect(formatExpression('percentage', 200, 15)).toBe('15% of 200');
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
    expect(errorMessage('DIVISION_BY_ZERO')).toMatch(/divide by zero/);
    expect(errorMessage('NETWORK_ERROR')).toMatch(/reach the server/);
    expect(errorMessage('RATE_LIMITED')).toMatch(/wait/i);
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
      message: 'Unknown error.',
    });
  });
});
