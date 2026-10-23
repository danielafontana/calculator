import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, REQUEST_TIMEOUT_MS, calculate, getOperations } from './api';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calculate', () => {
  it('posts the request as JSON and returns the result', async () => {
    const body = { result: 15, operation: 'add', operands: { a: 10, b: 5 } };
    fetchMock.mockResolvedValue(jsonResponse(body));

    await expect(calculate({ operation: 'add', a: 10, b: 5 })).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/calculate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ operation: 'add', a: 10, b: 5 }));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns API errors into a typed ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'division by zero', code: 'DIVISION_BY_ZERO' }, 400),
    );

    const error = await calculate({ operation: 'divide', a: 1, b: 0 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      message: 'division by zero',
      code: 'DIVISION_BY_ZERO',
      status: 400,
    });
  });

  it('handles 5xx responses without a JSON body', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 502,
    });
  });

  it('handles error bodies with unknown codes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'teapot', code: 'TEAPOT' }, 418));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 418,
    });
  });

  it('rejects successful responses with an unexpected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ value: 3 }));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('throws an ApiError for an error body returned with status 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'overflow', code: 'OVERFLOW' }));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'OVERFLOW',
    });
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('aborts after the timeout and reports TIMEOUT', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const assertion = expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });
});

describe('getOperations', () => {
  it('returns the operations list', async () => {
    const operations = [
      { name: 'add', symbol: '+', description: 'Sum', operands: 2 },
      { name: 'sqrt', symbol: '√', description: 'Root', operands: 1 },
    ];
    fetchMock.mockResolvedValue(jsonResponse({ operations }));

    await expect(getOperations()).resolves.toEqual(operations);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/operations');
  });

  it('rejects unknown operations in the payload', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        operations: [{ name: 'modulo', symbol: '%', description: 'x', operands: 2 }],
      }),
    );

    await expect(getOperations()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
});
