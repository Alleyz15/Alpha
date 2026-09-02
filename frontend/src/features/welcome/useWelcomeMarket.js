import { useCallback, useEffect, useRef, useState } from 'react';
import { toMarketAssetViewModel } from '../../adapters/quoteViewModel.js';

function normaliseMarket(payload) {
  if (!Array.isArray(payload?.assets)) {
    throw new Error('Market context did not contain an asset list');
  }

  const assets = payload.assets.flatMap((asset) => {
    if (!asset || typeof asset !== 'object' || typeof asset.symbol !== 'string' || !asset.symbol.trim()) {
      return [];
    }

    const symbol = asset.symbol.trim().toUpperCase();
    const holdingUnits = asset.holdingUnits == null ? null : Number(asset.holdingUnits);
    return [toMarketAssetViewModel({
      ...asset,
      symbol,
      name: asset.name || symbol,
      holdingUnits: Number.isFinite(holdingUnits) ? holdingUnits : null,
    }, payload.updatedAt)];
  });

  if (assets.length === 0) {
    throw new Error('Market context did not contain a usable asset');
  }

  return { assets, updatedAt: payload.updatedAt, reality: payload.reality };
}

export default function useWelcomeMarket(apiClient, pollInterval = 30_000) {
  const [market, setMarket] = useState(null);
  const [state, setState] = useState('loading');
  const [refreshError, setRefreshError] = useState(false);
  const mounted = useRef(true);
  const hasMarket = useRef(false);

  const load = useCallback(async () => {
    try {
      const payload = await apiClient.getMarketContext();
      const nextMarket = normaliseMarket(payload);
      if (!mounted.current) return;
      setMarket(nextMarket);
      hasMarket.current = true;
      setState('ready');
      setRefreshError(false);
    } catch {
      if (!mounted.current) return;
      if (hasMarket.current) {
        setRefreshError(true);
      } else {
        setState('error');
      }
    }
  }, [apiClient]);

  useEffect(() => {
    mounted.current = true;
    load();

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, pollInterval);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load, pollInterval]);

  return { market, state, refreshError, retry: load };
}
