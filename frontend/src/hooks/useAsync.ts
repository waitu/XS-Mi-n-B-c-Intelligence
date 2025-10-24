import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

type Factory<T> = () => Promise<T>;

interface UseAsyncOptions<T> {
  initialData?: T | null;
  immediate?: boolean;
}

export function useAsync<T>(factory: Factory<T>, deps: unknown[], options: UseAsyncOptions<T> = {}) {
  const { initialData = null, immediate = true } = options;
  const [state, setState] = useState<AsyncState<T>>({ data: initialData ?? null, error: null, loading: immediate });
  const depsRef = useRef(deps);

  const execute = useCallback(async () => {
    setState((prev: AsyncState<T>) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await factory();
      setState({ data: result, error: null, loading: false });
      return result;
    } catch (error) {
      setState({ data: null, error: error as Error, loading: false });
      throw error;
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const depsChanged =
      depsRef.current.length !== deps.length ||
      depsRef.current.some((value: unknown, index: number) => value !== deps[index]);
    if (depsChanged) {
      depsRef.current = deps;
    }
    if (immediate) {
      execute().catch(() => undefined);
    }
    return () => {
      // noop cleanup
    };
  }, [execute, immediate]);

  const reload = useCallback(() => execute().catch(() => undefined), [execute]);

  return { ...state, reload };
}
