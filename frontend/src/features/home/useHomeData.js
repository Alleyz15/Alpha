import { useCallback, useEffect, useRef, useState } from 'react';

const initialSource = { state: 'loading', data: null, refreshError: false };

export default function useHomeData(apiClient, summaryPollInterval = 45_000, candlePollInterval = 300_000) {
  const [demo, setDemo] = useState(initialSource);
  const [portfolio, setPortfolio] = useState(initialSource);
  const [market, setMarket] = useState(initialSource);
  const [candles, setCandles] = useState({});
  const [candleFailures, setCandleFailures] = useState([]);
  const mounted = useRef(true);
  const candleLoadedAt = useRef(0);

  const updateSource = useCallback((setter, result) => {
    if (!mounted.current) return;
    setter((current) => result.status === 'fulfilled'
      ? { state: 'ready', data: result.value, refreshError: false }
      : current.data
        ? { ...current, refreshError: true }
        : { state: 'error', data: null, refreshError: false });
  }, []);

  const loadSummary = useCallback(async () => {
    const [demoResult, portfolioResult, marketResult] = await Promise.allSettled([
      apiClient.getDemoContext(),
      apiClient.getPortfolio(),
      apiClient.getAssetsOverview(),
    ]);
    updateSource(setDemo, demoResult);
    updateSource(setPortfolio, portfolioResult);
    updateSource(setMarket, marketResult);
  }, [apiClient, updateSource]);

  const loadCandles = useCallback(async (symbols, force = false) => {
    if (!symbols.length) return;
    if (!force && Date.now() - candleLoadedAt.current < candlePollInterval) return;
    const results = await Promise.allSettled(
      symbols.map((symbol) => apiClient.getAssetCandles(symbol, '1W')),
    );
    if (!mounted.current) return;
    const nextCandles = {};
    const failed = [];
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled' && Array.isArray(result.value?.candles)) {
        nextCandles[symbol] = result.value.candles;
      } else {
        failed.push(symbol);
      }
    });
    setCandles((current) => ({ ...current, ...nextCandles }));
    setCandleFailures(failed);
    candleLoadedAt.current = Date.now();
  }, [apiClient, candlePollInterval]);

  useEffect(() => {
    mounted.current = true;
    loadSummary();
    return () => { mounted.current = false; };
  }, [loadSummary]);

  useEffect(() => {
    const symbols = market.data?.assets?.map((asset) => asset.symbol).filter(Boolean) ?? [];
    if (symbols.length) loadCandles(symbols);
  }, [loadCandles, market.data]);

  useEffect(() => {
    const summaryTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') loadSummary();
    }, summaryPollInterval);
    const candleTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        const symbols = market.data?.assets?.map((asset) => asset.symbol).filter(Boolean) ?? [];
        if (symbols.length) loadCandles(symbols, true);
      }
    }, candlePollInterval);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadSummary();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(summaryTimer);
      window.clearInterval(candleTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [candlePollInterval, loadCandles, loadSummary, market.data, summaryPollInterval]);

  return {
    demo,
    portfolio,
    market,
    candles,
    candleFailures,
    retry: loadSummary,
  };
}
