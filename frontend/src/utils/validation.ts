import type { CalculateRequest, Operation } from '../types/calculator';
import { isUnary } from './operations';

/** Accepts integers, decimals (dot or comma) and scientific notation. */
const NUMBER_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

/** Parses user input into a finite number, or null when invalid. */
export function parseNumber(input: string): number | null {
  const value = input.trim();
  if (!NUMBER_PATTERN.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export type FieldError = 'required' | 'invalid';

export interface FormValues {
  operation: Operation;
  a: string;
  b: string;
}

export type FieldErrors = Partial<Record<'a' | 'b', FieldError>>;

export type FormValidation =
  | { valid: true; request: CalculateRequest; errors: FieldErrors }
  | { valid: false; errors: FieldErrors };

function validateField(input: string): number | FieldError {
  if (input.trim() === '') return 'required';
  return parseNumber(input) ?? 'invalid';
}

/** Validates the form and builds the request when every field is valid. */
export function validateForm({ operation, a, b }: FormValues): FormValidation {
  const errors: FieldErrors = {};

  const parsedA = validateField(a);
  if (typeof parsedA !== 'number') errors.a = parsedA;

  if (isUnary(operation)) {
    return typeof parsedA === 'number'
      ? { valid: true, request: { operation, a: parsedA }, errors }
      : { valid: false, errors };
  }

  const parsedB = validateField(b);
  if (typeof parsedB !== 'number') errors.b = parsedB;

  if (typeof parsedA === 'number' && typeof parsedB === 'number') {
    return { valid: true, request: { operation, a: parsedA, b: parsedB }, errors };
  }
  return { valid: false, errors };
}

export const FIELD_ERROR_MESSAGES: Record<FieldError, string> = {
  required: 'Informe um número.',
  invalid: 'Use apenas números, como 12, -3,5 ou 1e6.',
};
