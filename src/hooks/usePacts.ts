import { useCallback, useEffect, useState } from 'react';
import {
  getPactById,
  getPacts,
  getSoloGoalById,
  getSoloGoals,
} from '../services/pactService';
import type { Pact, SoloGoal } from '../types';

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function useLoadable<T>(loader: () => Promise<T>, initial: T): Loadable<T> {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load data.');
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function usePacts() {
  const loader = useCallback(() => getPacts(), []);
  const result = useLoadable<Pact[]>(loader, []);
  return { ...result, pacts: result.data };
}

export function usePact(id: string) {
  const loader = useCallback(() => getPactById(id), [id]);
  const result = useLoadable<Pact | undefined>(loader, undefined);
  return { ...result, pact: result.data };
}

export function useSoloGoals() {
  const loader = useCallback(() => getSoloGoals(), []);
  const result = useLoadable<SoloGoal[]>(loader, []);
  return { ...result, goals: result.data };
}

export function useSoloGoal(id: string) {
  const loader = useCallback(() => getSoloGoalById(id), [id]);
  const result = useLoadable<SoloGoal | undefined>(loader, undefined);
  return { ...result, goal: result.data };
}
