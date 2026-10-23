import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import * as api from '../services/api';
import { OPERATIONS } from '../types/calculator';
import { useOperations } from './useOperations';

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getOperations: vi.fn(),
}));

const getOperationsMock = vi.mocked(api.getOperations);

describe('useOperations', () => {
  it('uses the operations returned by the API', async () => {
    getOperationsMock.mockResolvedValue([
      { name: 'sqrt', symbol: '√', description: 'Root', operands: 1 },
      { name: 'add', symbol: '+', description: 'Sum', operands: 2 },
    ]);

    const { result } = renderHook(() => useOperations());

    expect(result.current).toEqual(OPERATIONS);
    await waitFor(() => {
      expect(result.current).toEqual(['sqrt', 'add']);
    });
  });

  it('keeps every operation when the API fails', async () => {
    getOperationsMock.mockRejectedValue(new api.ApiError('offline', 'NETWORK_ERROR'));

    const { result } = renderHook(() => useOperations());

    await waitFor(() => {
      expect(getOperationsMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual(OPERATIONS);
  });

  it('keeps every operation when the API returns an empty list', async () => {
    getOperationsMock.mockResolvedValue([]);

    const { result } = renderHook(() => useOperations());

    await waitFor(() => {
      expect(getOperationsMock).toHaveBeenCalled();
    });
    expect(result.current).toEqual(OPERATIONS);
  });

  it('ignores the response after unmount', async () => {
    let resolve: (value: Awaited<ReturnType<typeof api.getOperations>>) => void = () => undefined;
    getOperationsMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result, unmount } = renderHook(() => useOperations());
    unmount();
    resolve([{ name: 'add', symbol: '+', description: 'Sum', operands: 2 }]);
    await Promise.resolve();

    expect(result.current).toEqual(OPERATIONS);
  });
});
