import { useCallback, useEffect, useRef, useState } from 'react';
import { toMarketAssetViewModel } from '../../adapters/quoteViewModel.js';
import { supportedAssets } from './welcomeContent.js';

function normaliseMarket(payload) {
  if (!Array.isArray(payload?.assets)) {
    throw new Error('Market context did not contain an asset list');
  }

  const received = new Map(payload.assets.map((asset) => [asset?.symbol, asset]));
  const assets = supportedAssets.map((supported) => {
    const asset = received.get(supported.symbol);
    if (!asset || typeof asset !== 'object') {
      return {
        ...supported,
        malformed: true,
        priceLabel: '—',
        holdingLabel: '—',
        availabilityLabel: 'Market information unavailable for this asset',
        unavailableReason: 'Market information unavailable for this asset',
        protectionAvailable: false,
        updatedAtLabel: 'Update time unavailable',
      };
    }

    const holdingUnits = Number(asset.holdingUnits);
    return toMarketAssetViewModel({
      ...asset,
      name: asset.name || supported.name,
      holdingUnits: Number.isFinite(holdingUnits) ? holdingUnits : 0,
    }, payload.updatedAt);
  });

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
