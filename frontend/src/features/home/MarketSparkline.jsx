import { useMemo } from 'react';

const width = 104;
const height = 34;
const padding = 2;

function sparklinePath(values) {
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(maximum * 0.01, 1);
  return values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = padding + ((maximum - value) / spread) * (height - padding * 2);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

export default function MarketSparkline({ values = [], tone = 'neutral', symbol }) {
  const path = useMemo(() => sparklinePath(values), [values]);
  if (!path) return <span className="home-sparkline-unavailable">Unavailable</span>;

  return (
    <svg className={`home-sparkline home-sparkline--${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} seven-day Binance USDT trend`}>
      <path className="home-sparkline__path" d={path} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

