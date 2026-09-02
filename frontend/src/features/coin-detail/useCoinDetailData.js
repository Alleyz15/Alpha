import { useCallback, useEffect, useRef, useState } from 'react';
import { toOverviewViewModel } from './coinDetailViewModel.js';

export default function useCoinDetailData(apiClient, symbol, orderBookPollInterval = 3_000) {
  const mounted = useRef(true);
  const [overview, setOverview] = useState({ status: 'loading', asset: null, error: null });
  const [orderBook, setOrderBook] = useState({ status: 'idle', data: null, error: null });

  const loadOverview = useCallback(async () => {
    setOverview({ status: 'loading', asset: null, error: null });
    try {
      const payload = await apiClient.getAssetsOverview();
      const rawAsset = payload?.assets?.find((asset) => asset?.symbol?.toUpperCase() === symbol);
      if (!mounted.current) return;
      if (!rawAsset) {
        setOverview({ status: 'not-found', asset: null, error: null });
        return;
      }
      setOverview({
        status: 'ready',
        asset: toOverviewViewModel({
          ...rawAsset,
          quoteCurrency: rawAsset.quoteCurrency || payload.quoteCurrency,
          source: rawAsset.source || payload.source,
          updatedAt: rawAsset.updatedAt || payload.updatedAt,
        }),
        error: null,
      });
    } catch (error) {
      if (mounted.current) setOverview({ status: 'error', asset: null, error });
    }
  }, [apiClient, symbol]);

  const loadOrderBook = useCallback(async () => {
    setOrderBook((current) => ({ ...current, status: current.data ? 'refreshing' : 'loading', error: null }));
    try {
      const payload = await apiClient.getAssetOrderBook(symbol);
      if (!mounted.current) return;
      setOrderBook({ status: 'ready', data: payload, error: null });
    } catch (error) {
      if (mounted.current) setOrderBook({ status: 'error', data: null, error });
    }
  }, [apiClient, symbol]);

  useEffect(() => {
    mounted.current = true;
    loadOverview();
    return () => { mounted.current = false; };
  }, [loadOverview]);

  useEffect(() => {
    if (overview.status !== 'ready') {
      setOrderBook({ status: 'idle', data: null, error: null });
      return undefined;
    }

    let timer;
    const stopPolling = () => {
      if (timer) window.clearInterval(timer);
      timer = undefined;
    };
    const startPolling = () => {
      stopPolling();
      if (document.visibilityState === 'hidden') return;
      loadOrderBook();
      timer = window.setInterval(loadOrderBook, orderBookPollInterval);
    };
    const handleVisibilityChange = () => startPolling();

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadOrderBook, orderBookPollInterval, overview.status]);

  return {
    overview,
    orderBook,
    retryOverview: loadOverview,
    retryOrderBook: loadOrderBook,
  };
}
