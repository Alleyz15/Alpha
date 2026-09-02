import { useEffect, useMemo, useState } from 'react';

export const ASSET_IDENTITIES = Object.freeze({
  ETH: { name: 'Ethereum', logo: '/assets/coins/eth.svg' },
  BTC: { name: 'Bitcoin', logo: '/assets/coins/btc.svg' },
  SOL: { name: 'Solana', logo: '/assets/coins/sol.svg' },
  BNB: { name: 'BNB', logo: '/assets/coins/bnb.svg' },
  AVAX: { name: 'Avalanche', logo: '/assets/coins/avax.svg' },
  XRP: { name: 'XRP', logo: '/assets/coins/xrp.svg' },
});

export function getAssetIdentity(symbol, suppliedName) {
  const normalizedSymbol = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const known = ASSET_IDENTITIES[normalizedSymbol];
  return {
    symbol: normalizedSymbol || '—',
    name: suppliedName || known?.name || normalizedSymbol || 'Unknown asset',
    logo: known?.logo ?? null,
  };
}

export default function AssetLogo({ symbol, name, imageUrl, size = 'medium', className = '' }) {
  const identity = getAssetIdentity(symbol, name);
  const sources = useMemo(
    () => [...new Set([imageUrl, identity.logo].filter(Boolean))],
    [imageUrl, identity.logo],
  );
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [imageUrl, identity.logo]);

  const source = sources[sourceIndex];
  const classes = `asset-logo asset-logo--${size} ${className}`.trim();

  if (!source) {
    return (
      <span className={`${classes} asset-logo--fallback`} role="img" aria-label={identity.name}>
        {identity.symbol.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className={classes}>
      <img
        src={source}
        alt={identity.name}
        onError={() => setSourceIndex((current) => current + 1)}
      />
    </span>
  );
}
