import { ApiError } from '../services/api';
import type { ApiErrorCode } from '../types/calculator';

const MESSAGES: Record<ApiErrorCode, string> = {
  DIVISION_BY_ZERO: 'Cannot divide by zero. Use a non-zero divisor.',
  NEGATIVE_SQRT:
    'Negative numbers have no real square root. Use a number greater than or equal to zero.',
  OVERFLOW: 'The result is too large to represent. Try smaller numbers.',
  UNDEFINED_RESULT: 'The result is not a real number. Check the base and the exponent.',
  INVALID_OPERAND: 'The numbers entered are not valid.',
  MISSING_OPERAND: 'Fill in every number for this operation.',
  INVALID_OPERATION: 'The server does not support this operation.',
  INVALID_PAYLOAD: 'The server could not understand the request.',
  UNSUPPORTED_MEDIA_TYPE: 'The server could not understand the request.',
  RATE_LIMITED: 'Too many calculations in a short time. Wait a few seconds and try again.',
  INTERNAL_ERROR: 'The server hit an error. Try again in a moment.',
  NETWORK_ERROR: 'Cannot reach the server. Check that the API is running.',
  TIMEOUT: 'The server took too long to respond. Try again.',
  UNEXPECTED_RESPONSE: 'The server sent an unexpected response.',
};

/** User-facing message for an API error code. */
export function errorMessage(code: ApiErrorCode): string {
  return MESSAGES[code];
}

/** Normalizes any thrown value into an ApiError. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : 'Unknown error.';
  return new ApiError(message, 'UNEXPECTED_RESPONSE');
}
