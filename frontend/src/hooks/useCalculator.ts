import { useCallback, useRef, useState } from 'react';

import { calculate as calculateRequest, type ApiError } from '../services/api';
import type { CalculateRequest, CalculateSuccess } from '../types/calculator';
import { toApiError } from '../utils/errors';

export type CalculatorState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CalculateSuccess }
  | { status: 'error'; error: ApiError };

export interface UseCalculator {
  calculate: (req: CalculateRequest) => Promise<CalculateSuccess | undefined>;
  reset: () => void;
  status: CalculatorState['status'];
  result: CalculateSuccess | null;
  error: ApiError | null;
  loading: boolean;
}

/**
 * Runs calculations against the API and tracks request state. Responses of
 * superseded requests (or requests made before reset) are ignored.
 */
export function useCalculator(): UseCalculator {
  const [state, setState] = useState<CalculatorState>({ status: 'idle' });
  const latestRequest = useRef(0);

  const calculate = useCallback(async (req: CalculateRequest) => {
    const id = ++latestRequest.current;
    setState({ status: 'loading' });
    try {
      const data = await calculateRequest(req);
      if (id === latestRequest.current) setState({ status: 'success', data });
      return data;
    } catch (err) {
      if (id === latestRequest.current) setState({ status: 'error', error: toApiError(err) });
      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    latestRequest.current++;
    setState({ status: 'idle' });
  }, []);

  return {
    calculate,
    reset,
    status: state.status,
    result: state.status === 'success' ? state.data : null,
    error: state.status === 'error' ? state.error : null,
    loading: state.status === 'loading',
  };
}
