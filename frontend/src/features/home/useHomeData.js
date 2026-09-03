import { useCallback, useEffect, useRef, useState } from 'react';

const initialSource = { state: 'loading', data: null, refreshError: false };

export default function useHomeData(apiClient, summaryPollInterval = 45_000) {
  const [portfolio, setPortfolio] = useState(initialSource);
  const [market, setMarket] = useState(initialSource);
  const [candles, setCandles] = useState({});
  const [candleFailures, setCandleFailures] = useState([]);
  const mounted = useRef(true);
  const requestedCandleSymbols = useRef(new Set());

  const updateSource = useCallback((setter, result) => {
    if (!mounted.current) return;
    setter((current) => result.status === 'fulfilled'
      ? { state: 'ready', data: result.value, refreshError: false }
      : current.data
        ? { ...current, refreshError: true }
        : { state: 'error', data: null, refreshError: false });
  }, []);

  const loadSummary = useCallback(async () => {
    const [portfolioResult, marketResult] = await Promise.allSettled([
      apiClient.getPortfolio(),
      apiClient.getAssetsOverview(),
    ]);
    updateSource(setPortfolio, portfolioResult);
    updateSource(setMarket, marketResult);
  }, [apiClient, updateSource]);

  const loadCandles = useCallback(async (symbols) => {
    const unrequestedSymbols = symbols.filter((symbol) => !requestedCandleSymbols.current.has(symbol));
    if (!unrequestedSymbols.length) return;
    unrequestedSymbols.forEach((symbol) => requestedCandleSymbols.current.add(symbol));
    const results = await Promise.allSettled(
      unrequestedSymbols.map((symbol) => apiClient.getAssetCandles(symbol, '1W')),
    );
    if (!mounted.current) return;
    const nextCandles = {};
    const failed = [];
    results.forEach((result, index) => {
      const symbol = unrequestedSymbols[index];
      if (result.status === 'fulfilled' && Array.isArray(result.value?.candles)) {
        nextCandles[symbol] = result.value.candles;
      } else {
        failed.push(symbol);
      }
    });
    setCandles((current) => ({ ...current, ...nextCandles }));
    setCandleFailures(failed);
  }, [apiClient]);

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
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadSummary();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(summaryTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadSummary, summaryPollInterval]);

  return {
    portfolio,
    market,
    candles,
    candleFailures,
    retry: loadSummary,
  };
}
