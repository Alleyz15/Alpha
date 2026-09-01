import { useEffect, useRef, useState } from 'react';
import { animate } from 'animejs';
import { ArrowIcon, ShieldIcon } from '../../components/Icons.jsx';
import Button from '../../components/ui/Button.jsx';
import RealityBadge from '../../components/ui/RealityBadge.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import SignalGrid from './SignalGrid.jsx';
import WelcomeJourney from './WelcomeJourney.jsx';
import useWelcomeAnimations, { pulseMarketSnapshot } from './useWelcomeAnimations.js';
import useWelcomeMarket from './useWelcomeMarket.js';
import { benefits, identityStatements, realityGroups, supportedAssets } from './welcomeContent.js';

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function MarketFailure({ retry }) {
  return (
    <div className="welcome-market-state welcome-market-state--error" role="alert">
      <span aria-hidden="true">!</span>
      <strong>Live market information is temporarily unavailable</strong>
      <p>Alpha could not reach the market right now. No sample values have been substituted.</p>
      <Button variant="ghost" size="small" onClick={retry}>Try again</Button>
    </div>
  );
}

function MarketSnapshot({ market, state, retry, selectedSymbol, setSelectedSymbol }) {
  if (state === 'error') return <MarketFailure retry={retry} />;
  if (!market) {
    return (
      <div className="welcome-market-state" role="status">
        <span className="welcome-market-state__spinner" aria-hidden="true" />
        <strong>Checking live market availability…</strong>
      </div>
    );
  }

  const selected = market.assets.find((asset) => asset.symbol === selectedSymbol) ?? market.assets[0];
  const priceMissing = selected.priceLabel === '—';

  return (
    <>
      <div className="welcome-snapshot__tabs" role="tablist" aria-label="Live market assets">
        {supportedAssets.map((asset) => (
          <button
            type="button"
            role="tab"
            aria-selected={selected.symbol === asset.symbol}
            className={selected.symbol === asset.symbol ? 'is-active' : ''}
            onClick={() => setSelectedSymbol(asset.symbol)}
            key={asset.symbol}
          >
            {asset.symbol}
          </button>
        ))}
      </div>
      <div className="welcome-snapshot__asset">
        <div>
          <small>{selected.name}</small>
          <strong data-market-value>{priceMissing ? '—' : selected.priceLabel}</strong>
          <span>{priceMissing ? 'Live price temporarily unavailable' : selected.updatedAtLabel}</span>
        </div>
        <span className="welcome-token-mark" aria-hidden="true">{selected.symbol.slice(0, 1)}</span>
      </div>
      <dl className="welcome-snapshot__facts">
        <div>
          <dt>Protection</dt>
          <dd data-market-value>{selected.malformed ? selected.unavailableReason : selected.availabilityLabel}</dd>
        </div>
        <div>
          <dt>Displayed holding</dt>
          <dd data-market-value>{selected.holdingLabel}</dd>
          <small>Simulated</small>
        </div>
      </dl>
      {!selected.protectionAvailable && selected.unavailableReason && !selected.malformed && (
        <p className="welcome-snapshot__reason">{selected.unavailableReason}</p>
      )}
    </>
  );
}

function IdentityRotator() {
  const [index, setIndex] = useState(0);
  const phraseRef = useRef(null);

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % identityStatements.length), 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!phraseRef.current || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let animation;
    try {
      animation = animate(phraseRef.current, {
        opacity: [.45, 1],
        y: [10, 0],
        duration: 520,
        ease: 'outExpo',
      });
    } catch {
      animation = null;
    }
    return () => animation?.revert?.();
  }, [index]);

  return (
    <div className="welcome-mission__identity" aria-live="polite">
      <span>Alpha is</span>
      <strong ref={phraseRef}>{identityStatements[index]}</strong>
      <div aria-hidden="true">
        {identityStatements.map((statement, itemIndex) => (
          <i key={statement} className={itemIndex === index ? 'is-active' : ''} />
        ))}
      </div>
    </div>
  );
}

function MarketCard({ asset, onProtect }) {
  const unavailableMessage = asset.malformed
    ? asset.unavailableReason
    : asset.unavailableReason || 'No protection is being offered for this asset right now.';

  return (
    <article className="welcome-market-card">
      <header>
        <span className="welcome-token-mark" aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
        <div><h3>{asset.name}</h3><p>{asset.symbol}</p></div>
        <StatusBadge tone={asset.protectionAvailable ? 'live' : 'neutral'}>
          {asset.protectionAvailable ? 'Available' : 'Unavailable'}
        </StatusBadge>
      </header>
      <dl>
        <div><dt>Live price</dt><dd data-market-value>{asset.priceLabel}</dd></div>
        <div><dt>Simulated holding</dt><dd data-market-value>{asset.holdingLabel}</dd></div>
        <div><dt>Protection</dt><dd data-market-value>{asset.availabilityLabel}</dd></div>
      </dl>
      {!asset.protectionAvailable && <p className="welcome-market-card__reason">{unavailableMessage}</p>}
      <footer>
        <span>{asset.priceLabel === '—' ? 'Live price temporarily unavailable' : asset.updatedAtLabel}</span>
        <button
          className="alpha-button alpha-button--ghost alpha-button--small"
          type="button"
          disabled={!asset.protectionAvailable || asset.priceLabel === '—'}
          onClick={() => onProtect(asset.symbol)}
        >
          Protect {asset.symbol}
        </button>
      </footer>
    </article>
  );
}

function WelcomeHeader({ onDashboard }) {
  return (
    <header className="welcome-header">
      <a className="welcome-brand" href="/" aria-label="Alpha home">
        <span><ShieldIcon size={18} /></span>
        <strong>ALPHA</strong>
        <small>Downside protection</small>
      </a>
      <nav aria-label="Welcome page">
        <a href="#how-it-works">How it works</a>
        <a href="#live-market">Live market</a>
        <a href="#product-reality">Product reality</a>
      </nav>
      <button className="alpha-button alpha-button--ghost alpha-button--small" type="button" onClick={onDashboard}>
        My protection
      </button>
    </header>
  );
}

export default function WelcomePage({ apiClient, marketPollInterval = 30_000, onProtect = () => {}, onDashboard = () => {} }) {
  const rootRef = useRef(null);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const { market, state, refreshError, retry } = useWelcomeMarket(apiClient, marketPollInterval);
  useWelcomeAnimations(rootRef);

  useEffect(() => {
    if (market?.updatedAt) pulseMarketSnapshot(rootRef);
  }, [market?.updatedAt]);

  const selectedAsset = market?.assets.find((asset) => asset.symbol === selectedSymbol);
  const selectedAssetAvailable = Boolean(
    selectedAsset?.protectionAvailable && selectedAsset.priceLabel !== '—',
  );

  return (
    <div className="welcome-page" ref={rootRef}>
      <div className="welcome-ambient" aria-hidden="true" />
      <WelcomeHeader onDashboard={onDashboard} />

      <main>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-hero__copy">
            <p className="welcome-eyebrow welcome-hero__eyebrow"><span /> LIVE DOWNSIDE PROTECTION</p>
            <h1 id="welcome-title">
              <span className="welcome-hero__title-line">Crypto moves.</span>
              <span className="welcome-hero__title-line welcome-gradient-text">Your plans should not have to.</span>
            </h1>
            <p className="welcome-hero__intro">Alpha turns live market protection into clear choices: how much is covered, your price floor, the amount paid, and the end date.</p>
            <div className="welcome-hero__actions">
              <button
                className="alpha-button alpha-button--primary alpha-button--large"
                type="button"
                disabled={!selectedAssetAvailable}
                onClick={() => onProtect(selectedSymbol)}
              >
                {selectedAssetAvailable ? `Protect ${selectedSymbol}` : 'Checking live availability'} <ArrowIcon />
              </button>
              <button className="alpha-button alpha-button--ghost alpha-button--large" type="button" onClick={() => scrollTo('how-it-works')}>
                How Alpha works
              </button>
            </div>
            <dl className="welcome-hero__facts">
              <div><dt>4</dt><dd>Supported assets</dd></div>
              <div><dt>Base</dt><dd>Execution network</dd></div>
              <div><dt>USDC</dt><dd>Settlement asset</dd></div>
            </dl>
          </div>

          <div className="welcome-hero__visual">
            <SignalGrid />
            <article className="welcome-snapshot">
              <header>
                <div><span className="welcome-live-dot" /> <strong>Live market snapshot</strong></div>
                <RealityBadge kind="live" label="Live backend" />
              </header>
              <MarketSnapshot
                market={market}
                state={state}
                retry={retry}
                selectedSymbol={selectedSymbol}
                setSelectedSymbol={setSelectedSymbol}
              />
              <footer>Price and availability come from Alpha’s live backend market context.</footer>
            </article>
          </div>
        </section>

        {refreshError && (
          <div className="welcome-refresh-warning" role="status">
            <span>!</span> Live update paused. Showing the last successful market snapshot.
            <button type="button" onClick={retry}>Try again</button>
          </div>
        )}

        <section className="welcome-section welcome-benefits" aria-labelledby="benefits-title">
          <div className="welcome-section__heading welcome-section__heading--center">
            <p className="welcome-eyebrow">BUILT AROUND THE DECISION</p>
            <h2 id="benefits-title">Protection without the trading-language barrier</h2>
          </div>
          <div className="welcome-benefits__grid">
            {benefits.map((benefit) => (
              <article className="welcome-benefit-card" key={benefit.number}>
                <span>{benefit.number}</span>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="welcome-mission" aria-labelledby="mission-title">
          <div>
            <p className="welcome-eyebrow">THE ALPHA APPROACH</p>
            <h2 id="mission-title">Protection should feel like a plan, not a trading terminal.</h2>
            <p>Alpha keeps the interface focused on what matters to the user: the amount covered, the price floor, the amount paid, and what happens at the end date.</p>
          </div>
          <IdentityRotator />
        </section>

        <WelcomeJourney />

        <section className="welcome-section welcome-market" id="live-market" aria-labelledby="market-title">
          <div className="welcome-section__heading">
            <p className="welcome-eyebrow">LIVE MARKET</p>
            <h2 id="market-title">Availability changes.<br /><span className="welcome-gradient-text">Alpha shows it honestly.</span></h2>
            <p>Protection availability and duration come from the live market. An unavailable asset stays visible with the backend’s reason instead of silently disappearing.</p>
          </div>

          {state === 'error' && <MarketFailure retry={retry} />}
          {state === 'loading' && <div className="welcome-market-state" role="status"><span className="welcome-market-state__spinner" /><strong>Checking live market availability…</strong></div>}
          {market && (
            <div className="welcome-market__grid">
              {market.assets.map((asset) => <MarketCard key={asset.symbol} asset={asset} onProtect={onProtect} />)}
            </div>
          )}
          <p className="welcome-market__note"><span aria-hidden="true">◌</span> Protection duration and availability can change as the live market changes.</p>
        </section>

        <section className="welcome-section welcome-comparison" aria-labelledby="comparison-title">
          <div className="welcome-section__heading welcome-section__heading--center">
            <p className="welcome-eyebrow">WHY PROTECTION</p>
            <h2 id="comparison-title">The same crypto.<br /><span className="welcome-gradient-text">A clearer downside plan.</span></h2>
          </div>
          <div className="welcome-comparison__grid">
            <article className="welcome-comparison__card welcome-comparison__card--without">
              <header><span>WITHOUT PROTECTION</span><strong>Market follows its own path</strong></header>
              <div className="welcome-comparison__visual" aria-hidden="true"><i /><i /><i /></div>
              <ul>
                <li>No defined value floor at the end date.</li>
                <li>Your result follows the market price all the way down.</li>
                <li>No separate USDC settlement if the market finishes lower.</li>
              </ul>
            </article>
            <article className="welcome-comparison__card welcome-comparison__card--with">
              <header><span>WITH PROTECTION</span><strong>A defined floor for the end date</strong></header>
              <div className="welcome-comparison__visual" aria-hidden="true"><i /><i /><i /></div>
              <ul>
                <li>A backend-issued price floor is shown before you continue.</li>
                <li>If the price finishes below the floor at the end date, protection pays in USDC.</li>
                <li>The amount paid and maximum loss for the protected portion are shown before the request.</li>
              </ul>
            </article>
          </div>
          <p className="welcome-comparison__note"><strong>Important:</strong> Protection is evaluated at the end date—not whenever the displayed market price crosses the floor.</p>
        </section>

        <section className="welcome-section welcome-reality" id="product-reality" aria-labelledby="reality-title">
          <div className="welcome-section__heading">
            <p className="welcome-eyebrow">PRODUCT REALITY</p>
            <h2 id="reality-title">Clear about what is real</h2>
            <p>Alpha is a prototype. Being clear about the boundary between live and simulated information is part of the product.</p>
          </div>
          <div className="welcome-reality__grid">
            {realityGroups.map((group) => (
              <article className={`welcome-reality-card welcome-reality-card--${group.kind}`} key={group.kind}>
                <RealityBadge kind={group.kind} label={group.eyebrow} />
                <h3>{group.title}</h3>
                <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="welcome-reality__callout"><ShieldIcon /><strong>Alpha simulates the user holding—not the live protection market.</strong></div>
        </section>

        <section className="welcome-cta" aria-labelledby="cta-title">
          <div>
            <p className="welcome-eyebrow">CHECK THE LIVE MARKET</p>
            <h2 id="cta-title">Know your floor before the market tests it</h2>
            <p>See which supported assets currently have protection available. No sample choices and no hidden trading language.</p>
          </div>
          <button
            className="alpha-button alpha-button--primary alpha-button--large"
            type="button"
            disabled={!selectedAssetAvailable}
            onClick={() => onProtect(selectedSymbol)}
          >
            {selectedAssetAvailable ? `Protect ${selectedSymbol}` : 'Protection unavailable'} <ArrowIcon />
          </button>
        </section>
      </main>

      <footer className="welcome-footer">
        <div>
          <a className="welcome-brand" href="/" aria-label="Alpha home"><span><ShieldIcon size={18} /></span><strong>ALPHA</strong></a>
          <p>Plain-language downside protection powered by live market choices.</p>
        </div>
        <nav aria-label="Footer"><a href="#how-it-works">How it works</a><a href="#live-market">Live market</a><a href="#product-reality">Product reality</a></nav>
        <p className="welcome-footer__disclosure">Market availability is live. Displayed holdings are simulated. On-chain activity is shown only when verified by the backend.</p>
        <div className="welcome-footer__bottom"><span>Protection execution and verification: Base</span><span>© 2026 Alpha · Prototype demonstration</span></div>
      </footer>
    </div>
  );
}
