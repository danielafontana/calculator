import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as api from '../services/api';
import type { CalculateSuccess } from '../types/calculator';
import { useCalculator } from './useCalculator';

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  calculate: vi.fn(),
}));

const calculateMock = vi.mocked(api.calculate);

const success: CalculateSuccess = { result: 3, operation: 'add', operands: { a: 1, b: 2 } };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useCalculator', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCalculator());

    expect(result.current).toMatchObject({
      status: 'idle',
      result: null,
      error: null,
      loading: false,
    });
  });

  it('exposes loading and then the result', async () => {
    const pending = deferred<CalculateSuccess>();
    calculateMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCalculator());

    let returned: Promise<CalculateSuccess | undefined> = Promise.resolve(undefined);
    act(() => {
      returned = result.current.calculate({ operation: 'add', a: 1, b: 2 });
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pending.resolve(success);
      await returned;
    });

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'add', a: 1, b: 2 });
    expect(result.current).toMatchObject({ status: 'success', result: success, loading: false });
    await expect(returned).resolves.toEqual(success);
  });

  it('stores ApiError on failure', async () => {
    const apiError = new api.ApiError('division by zero', 'DIVISION_BY_ZERO', 400);
    calculateMock.mockRejectedValue(apiError);
    const { result } = renderHook(() => useCalculator());

    let returned: CalculateSuccess | undefined = success;
    await act(async () => {
      returned = await result.current.calculate({ operation: 'divide', a: 1, b: 0 });
    });

    expect(returned).toBeUndefined();
    expect(result.current).toMatchObject({ status: 'error', error: apiError, result: null });
  });

  it('wraps unknown errors into ApiError', async () => {
    calculateMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCalculator());

    await act(async () => {
      await result.current.calculate({ operation: 'add', a: 1, b: 2 });
    });

    expect(result.current.error).toBeInstanceOf(api.ApiError);
    expect(result.current.error?.code).toBe('UNEXPECTED_RESPONSE');
    expect(result.current.error?.message).toBe('boom');
  });

  it('ignores responses from superseded requests', async () => {
    const first = deferred<CalculateSuccess>();
    const second = deferred<CalculateSuccess>();
    calculateMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      void result.current.calculate({ operation: 'add', a: 1, b: 2 });
      void result.current.calculate({ operation: 'add', a: 2, b: 2 });
    });

    const latest: CalculateSuccess = { ...success, result: 4, operands: { a: 2, b: 2 } };
    await act(async () => {
      second.resolve(latest);
      await second.promise;
    });
    await act(async () => {
      first.resolve(success);
      await first.promise;
    });

    expect(result.current.result).toEqual(latest);
  });

  it('reset returns to idle and drops in-flight responses', async () => {
    const pending = deferred<CalculateSuccess>();
    calculateMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      void result.current.calculate({ operation: 'add', a: 1, b: 2 });
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      pending.resolve(success);
      await pending.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(result.current.result).toBeNull();
  });
});
