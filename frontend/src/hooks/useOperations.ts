import { useEffect, useState } from 'react';

import { getOperations } from '../services/api';
import { OPERATIONS, type Operation } from '../types/calculator';

/**
 * Returns the operations offered by the backend, in the backend's order.
 * Falls back to every known operation while loading or if the request fails,
 * so the calculator stays usable.
 */
export function useOperations(): readonly Operation[] {
  const [operations, setOperations] = useState<readonly Operation[]>(OPERATIONS);

  useEffect(() => {
    let active = true;
    getOperations()
      .then((infos) => {
        if (active && infos.length > 0) setOperations(infos.map((info) => info.name));
      })
      .catch(() => {
        // Keep the local fallback list.
      });
    return () => {
      active = false;
    };
  }, []);

  return operations;
}
