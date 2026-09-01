import { useCallback, useEffect, useRef, useState } from 'react';

export default function useMarketContext({ apiClient, enabled, intervalMs = 30_000 }) {
  const [context, setContext] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const requestSequence = useRef(0);
  const contextRef = useRef(null);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!contextRef.current) setState('loading');

    try {
      const nextContext = await apiClient.getMarketContext();
      if (sequence !== requestSequence.current) return;
      contextRef.current = nextContext;
      setContext(nextContext);
      setState('ready');
      setError(null);
      setRefreshError(null);
    } catch (requestError) {
      if (sequence !== requestSequence.current) return;
      if (contextRef.current) {
        setRefreshError(requestError);
      } else {
        setError(requestError);
        setState('error');
      }
    }
  }, [apiClient]);

  useEffect(() => {
    if (!enabled) return undefined;

    load();
    const timer = window.setInterval(load, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, load]);

  return { context, state, error, refreshError, retry: load };
}
