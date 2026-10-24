import {
  isErrorCode,
  isOperation,
  type ApiErrorCode,
  type CalculateRequest,
  type CalculateResponse,
  type CalculateSuccess,
  type OperationInfo,
} from '../types/calculator';

export const REQUEST_TIMEOUT_MS = 10_000;

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Typed error thrown for every failed API call (HTTP 4xx/5xx, network, timeout). */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Guard<T> = (value: unknown) => value is T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCalculateResponse(value: unknown): value is CalculateResponse {
  if (!isRecord(value)) return false;
  if (typeof value.error === 'string') return isErrorCode(value.code);
  return isCalculateSuccess(value);
}

function isCalculateSuccess(value: unknown): value is CalculateSuccess {
  return (
    isRecord(value) &&
    typeof value.result === 'number' &&
    isOperation(value.operation) &&
    isRecord(value.operands) &&
    typeof value.operands.a === 'number'
  );
}

function isOperationInfo(value: unknown): value is OperationInfo {
  return (
    isRecord(value) &&
    isOperation(value.name) &&
    typeof value.symbol === 'string' &&
    typeof value.description === 'string' &&
    (value.operands === 1 || value.operands === 2)
  );
}

function isOperationsBody(value: unknown): value is { operations: OperationInfo[] } {
  return (
    isRecord(value) && Array.isArray(value.operations) && value.operations.every(isOperationInfo)
  );
}

async function request<T>(path: string, guard: Guard<T>, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        throw new ApiError('The request timed out.', 'TIMEOUT');
      }
      throw new ApiError('Could not connect to the server.', 'NETWORK_ERROR');
    }

    const body: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      if (isRecord(body) && typeof body.error === 'string' && isErrorCode(body.code)) {
        throw new ApiError(body.error, body.code, response.status);
      }
      throw new ApiError(
        `Unexpected response from the server (HTTP ${String(response.status)}).`,
        'UNEXPECTED_RESPONSE',
        response.status,
      );
    }

    if (!guard(body)) {
      throw new ApiError(
        'Unexpected response from the server.',
        'UNEXPECTED_RESPONSE',
        response.status,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs a calculation. Resolves with the success variant of
 * CalculateResponse; API errors are thrown as ApiError.
 */
export async function calculate(req: CalculateRequest): Promise<CalculateSuccess> {
  const body = await request('/api/v1/calculate', isCalculateResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if ('error' in body) {
    throw new ApiError(body.error, body.code);
  }
  return body;
}

/** Lists the operations supported by the backend. */
export async function getOperations(): Promise<OperationInfo[]> {
  const body = await request('/api/v1/operations', isOperationsBody);
  return body.operations;
}
