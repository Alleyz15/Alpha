import { useMemo } from 'react';
import { formatUsdc } from './portfolioViewModel.js';

const width = 760;
const height = 270;
const padding = 30;

function pointsFor(candles, strike) {
  const closes = candles.map((candle) => Number(candle.close)).filter(Number.isFinite);
  if (closes.length < 2) return null;
  const values = Number.isFinite(Number(strike)) ? [...closes, Number(strike)] : closes;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(maximum * 0.01, 1);
  const lower = minimum - spread * 0.12;
  const upper = maximum + spread * 0.12;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const y = (value) => padding + ((upper - value) / (upper - lower)) * chartHeight;
  const points = closes.map((value, index) => ({
    x: padding + (index / (closes.length - 1)) * chartWidth,
    y: y(value),
    value,
  }));
  return {
    points,
    linePath: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
    strikeY: Number.isFinite(Number(strike)) ? y(Number(strike)) : null,
    latest: closes.at(-1),
  };
}

export default function ProtectionTrackingChart({ candles = [], strike }) {
  const chart = useMemo(() => pointsFor(candles, strike), [candles, strike]);

  if (!chart) {
    return (
      <div className="pd-chart-empty" role="status">
        <span aria-hidden="true">⌁</span>
        <strong>Tracking chart unavailable</strong>
        <p>The market feed did not return enough real price points for this asset.</p>
      </div>
    );
  }

  const zonePath = chart.strikeY === null
    ? null
    : `${chart.linePath} L ${chart.points.at(-1).x} ${chart.strikeY} L ${chart.points[0].x} ${chart.strikeY} Z`;

  return (
    <div className="pd-chart-wrap">
      <svg className="pd-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price tracking chart. Latest market price ${formatUsdc(chart.latest)}.`}>
        <defs>
          <linearGradient id="pd-protected-zone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--signal)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="pd-price-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--primary-2)" />
            <stop offset="1" stopColor="var(--signal)" />
          </linearGradient>
        </defs>
        <g className="pd-chart-grid" aria-hidden="true">
          <line x1="30" y1="70" x2="730" y2="70" />
          <line x1="30" y1="135" x2="730" y2="135" />
          <line x1="30" y1="200" x2="730" y2="200" />
        </g>
        {zonePath && <path d={zonePath} fill="url(#pd-protected-zone)" />}
        {chart.strikeY !== null && (
          <g className="pd-strike-line">
            <line x1={padding} y1={chart.strikeY} x2={width - padding} y2={chart.strikeY} />
            <text x={width - padding} y={Math.max(16, chart.strikeY - 8)} textAnchor="end">Strike {formatUsdc(strike)}</text>
          </g>
        )}
        <path className="pd-price-line" d={chart.linePath} fill="none" />
        <circle className="pd-latest-point" cx={chart.points.at(-1).x} cy={chart.points.at(-1).y} r="5" />
      </svg>
    </div>
  );
}
