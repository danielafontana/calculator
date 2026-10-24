export const OPERATIONS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
] as const;

export type Operation = (typeof OPERATIONS)[number];

/** Error codes returned by the backend. */
export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'INVALID_OPERATION',
  'MISSING_OPERAND',
  'INVALID_OPERAND',
  'DIVISION_BY_ZERO',
  'NEGATIVE_SQRT',
  'OVERFLOW',
  'UNDEFINED_RESULT',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Error codes produced by the client when no valid API error is available. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'UNEXPECTED_RESPONSE';

export type ApiErrorCode = ErrorCode | ClientErrorCode;

export interface CalculateRequest {
  operation: Operation;
  a: number;
  b?: number;
}

export interface Operands {
  a: number;
  b?: number;
}

export interface CalculateSuccess {
  result: number;
  operation: Operation;
  operands: Operands;
}

export interface CalculateFailure {
  error: string;
  code: ErrorCode;
}

export type CalculateResponse = CalculateSuccess | CalculateFailure;

export interface OperationInfo {
  name: Operation;
  symbol: string;
  description: string;
  operands: 1 | 2;
}

export function isOperation(value: unknown): value is Operation {
  return typeof value === 'string' && (OPERATIONS as readonly string[]).includes(value);
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export function isCalculateFailure(response: CalculateResponse): response is CalculateFailure {
  return 'error' in response;
}
