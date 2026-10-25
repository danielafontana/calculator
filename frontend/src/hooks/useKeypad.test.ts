import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../services/api';
import type { CalculateRequest, CalculateSuccess } from '../types/calculator';
import type { KeyId } from '../utils/keypad';
import { useKeypad } from './useKeypad';

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  calculate: vi.fn(),
  getOperations: vi.fn(),
}));

const calculateMock = vi.mocked(api.calculate);
const getOperationsMock = vi.mocked(api.getOperations);

/** Minimal fake backend: answers with the real arithmetic. */
function answer(req: CalculateRequest): CalculateSuccess {
  const b = req.b ?? 0;
  const results: Record<CalculateRequest['operation'], number> = {
    add: req.a + b,
    subtract: req.a - b,
    multiply: req.a * b,
    divide: req.a / b,
    power: req.a ** b,
    sqrt: Math.sqrt(req.a),
    percentage: (req.a * b) / 100,
  };
  return { result: results[req.operation], operation: req.operation, operands: { a: req.a, b } };
}

async function press(result: { current: ReturnType<typeof useKeypad> }, ...keys: KeyId[]) {
  for (const key of keys) {
    await act(async () => {
      result.current.press(key);
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  getOperationsMock.mockRejectedValue(new api.ApiError('offline', 'NETWORK_ERROR'));
  calculateMock.mockImplementation((req) => Promise.resolve(answer(req)));
});

describe('useKeypad', () => {
  it('starts at zero', () => {
    const { result } = renderHook(() => useKeypad());
    expect(result.current).toMatchObject({
      value: '0',
      expression: '',
      error: null,
      loading: false,
    });
  });

  it('calculates through the API on equals', async () => {
    const { result } = renderHook(() => useKeypad());

    await press(result, '1', '2', 'multiply', '3', 'equals');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'multiply', a: 12, b: 3 });
    await waitFor(() => {
      expect(result.current.value).toBe('36');
    });
    expect(result.current.expression).toBe('12 × 3 =');
  });

  it('chains operations and exposes the pending operator', async () => {
    const { result } = renderHook(() => useKeypad());

    await press(result, '2', 'add', '3', 'subtract');

    await waitFor(() => {
      expect(result.current.value).toBe('5');
    });
    expect(result.current.operator).toBe('subtract');
    expect(result.current.expression).toBe('5 −');
  });

  it('applies square root and square immediately', async () => {
    const { result } = renderHook(() => useKeypad());

    await press(result, '9', 'sqrt');
    await waitFor(() => {
      expect(result.current.value).toBe('3');
    });
    await press(result, 'square');
    await waitFor(() => {
      expect(result.current.value).toBe('9');
    });
    expect(calculateMock).toHaveBeenLastCalledWith({ operation: 'power', a: 3, b: 2 });
  });

  it('shows API errors and restarts on the next key', async () => {
    calculateMock.mockRejectedValueOnce(
      new api.ApiError('division by zero', 'DIVISION_BY_ZERO', 400),
    );
    const { result } = renderHook(() => useKeypad());

    await press(result, '1', 'divide', '0', 'equals');
    await waitFor(() => {
      expect(result.current.error?.code).toBe('DIVISION_BY_ZERO');
    });

    await press(result, '7');
    expect(result.current).toMatchObject({ error: null, value: '7', expression: '' });

    calculateMock.mockRejectedValueOnce(new api.ApiError('x', 'OVERFLOW', 400));
    await press(result, 'square');
    await waitFor(() => {
      expect(result.current.error?.code).toBe('OVERFLOW');
    });
    await press(result, 'add');
    expect(result.current).toMatchObject({ error: null, value: '0', operator: null });
  });

  it('clears everything with C and the entry with CE', async () => {
    const { result } = renderHook(() => useKeypad());

    await press(result, '8', 'add', '5', 'clearEntry');
    expect(result.current).toMatchObject({ value: '0', expression: '8 +' });

    await press(result, 'backspace', 'decimal', '5', 'negate', 'clear');
    expect(result.current).toMatchObject({ value: '0', expression: '', operator: null });
  });

  it('ignores keys while a calculation is in flight', async () => {
    let resolve: (value: CalculateSuccess) => void = () => undefined;
    calculateMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useKeypad());

    await press(result, '2', 'add', '2', 'equals');
    expect(result.current.loading).toBe(true);
    await press(result, '9');
    expect(calculateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(answer({ operation: 'add', a: 2, b: 2 }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.value).toBe('4');
    });
  });

  it('reads the physical keyboard', async () => {
    const { result } = renderHook(() => useKeypad());
    const keydown = (key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
      act(() => {
        window.dispatchEvent(event);
      });
      return event;
    };

    keydown('4');
    keydown(',');
    keydown('5');
    expect(result.current.value).toBe('4.5');

    expect(keydown('*').defaultPrevented).toBe(true);
    keydown('2');
    keydown('Enter');
    await waitFor(() => {
      expect(result.current.value).toBe('9');
    });

    expect(keydown('a').defaultPrevented).toBe(false);
    keydown('Escape');
    expect(result.current.value).toBe('0');

    keydown('7', { ctrlKey: true });
    expect(result.current.value).toBe('0');
  });

  it('disables keys whose operation the backend does not offer', async () => {
    getOperationsMock.mockResolvedValue([
      { name: 'add', symbol: '+', description: 'Sum', operands: 2 },
      { name: 'sqrt', symbol: '√', description: 'Root', operands: 1 },
    ]);
    const { result } = renderHook(() => useKeypad());

    await waitFor(() => {
      expect(result.current.isAvailable('divide')).toBe(false);
    });
    expect(result.current.isAvailable('add')).toBe(true);
    expect(result.current.isAvailable('square')).toBe(false);
    expect(result.current.isAvailable('7')).toBe(true);

    await press(result, '6', 'divide');
    expect(result.current.operator).toBeNull();
  });

  it('removes the keyboard listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useKeypad());
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
