import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import { Button } from '../../components/ui/index.js';

const RANGES = ['1H', '1D', '1W', '1M', '1Y'];

function toChartCandles(candles) {
  return (candles || []).map((candle) => ({
    time: Math.floor(candle.timestamp / 1_000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

const CandlestickChart = memo(function CandlestickChart({ candles }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candles.length) return undefined;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 300,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8792ad',
      },
      grid: {
        vertLines: { color: 'rgba(140, 151, 178, 0.08)' },
        horzLines: { color: 'rgba(140, 151, 178, 0.08)' },
      },
      rightPriceScale: { borderColor: 'rgba(140, 151, 178, 0.18)' },
      timeScale: {
        borderColor: 'rgba(140, 151, 178, 0.18)',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#29d398',
      downColor: '#ff4d6a',
      wickUpColor: '#29d398',
      wickDownColor: '#ff4d6a',
      borderVisible: false,
    });
    series.setData(candles);
    chart.timeScale().fitContent();

    const resize = () => chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight || 300,
    });
    let observer;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      chart.remove();
    };
  }, [candles]);

  return <div className="coin-chart-slot__canvas" ref={containerRef} aria-label="Candlestick chart" />;
});

function CoinChartSlot({ symbol, apiClient }) {
  const [range, setRange] = useState('1D');
  const [state, setState] = useState({ status: 'loading', data: null });
  const requestId = useRef(0);

  const loadCandles = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState({ status: 'loading', data: null });
    try {
      const payload = await apiClient.getAssetCandles(symbol, range);
      if (currentRequest !== requestId.current) return;
      setState({ status: 'ready', data: payload });
    } catch {
      if (currentRequest === requestId.current) setState({ status: 'error', data: null });
    }
  }, [apiClient, range, symbol]);

  useEffect(() => {
    loadCandles();
    return () => { requestId.current += 1; };
  }, [loadCandles]);

  const payload = state.data;
  const candles = useMemo(
    () => (payload ? toChartCandles(payload.candles) : []),
    [payload],
  );

  return (
    <section className="coin-chart-slot" aria-label={`${symbol} Binance candlestick chart`}>
      <div className="coin-chart-slot__heading">
        <div>
          <span>Binance market chart</span>
          <strong>{payload?.pair ? `${symbol}/${payload.quoteCurrency}` : `${symbol}/USDT`}</strong>
          <small>{payload ? `Source: ${payload.source} · ${symbol}/${payload.quoteCurrency} · ${payload.range || range}` : `Source: Binance · ${symbol}/USDT · ${range}`}</small>
        </div>
        <div className="coin-chart-ranges" role="group" aria-label="Chart timeframe">
          {RANGES.map((option) => (
            <button
              className={option === range ? 'is-active' : ''}
              type="button"
              key={option}
              onClick={() => setRange(option)}
              aria-pressed={option === range}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' ? <div className="coin-chart-message">Loading current Binance candles…</div> : null}
      {state.status === 'error' ? (
        <div className="coin-chart-message coin-chart-message--error">
          <strong>Chart temporarily unavailable</strong>
          <p>Binance did not return current candles. No previous or sample chart is shown.</p>
          <Button variant="secondary" onClick={loadCandles}>Try again</Button>
        </div>
      ) : null}
      {state.status === 'ready' && candles.length ? <CandlestickChart candles={candles} /> : null}
      {state.status === 'ready' && !candles.length ? (
        <div className="coin-chart-message coin-chart-message--error">Chart temporarily unavailable</div>
      ) : null}

      <footer className="coin-chart-slot__footer">
        <p>Chart prices are {payload?.quoteCurrency || 'USDT'} from {payload?.source || 'Binance'}. Alpha protection quotes are separate and use USDC.</p>
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">Powered by TradingView Lightweight Charts</a>
      </footer>
    </section>
  );
}

export default memo(CoinChartSlot);
