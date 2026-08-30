import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, createScope } from 'animejs';

export default function FloorCrossingScenario({ tier, asset }) {
  const root = useRef(null);
  const [replayKey, setReplayKey] = useState(0);
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (reducedMotion) return undefined;

    const scope = createScope({ root }).add(() => {
      animate('.scenario-curve', {
        strokeDashoffset: [520, 0],
        duration: 2400,
        ease: 'inOutQuad',
      });

      animate('.scenario-price-dot', {
        translateX: [0, 520],
        translateY: [0, 155],
        duration: 2400,
        ease: 'inOutQuad',
      });

      animate('.scenario-floor-line', {
        opacity: [0.42, 0.42, 1],
        scaleX: [0.96, 0.96, 1.02, 1],
        filter: [
          'drop-shadow(0 0 0 rgba(46, 226, 161, 0))',
          'drop-shadow(0 0 0 rgba(46, 226, 161, 0))',
          'drop-shadow(0 0 12px rgba(46, 226, 161, .95))',
          'drop-shadow(0 0 7px rgba(46, 226, 161, .7))',
        ],
        duration: 1120,
        delay: 1260,
        ease: 'outExpo',
      });

      animate('.scenario-crossing-pulse', {
        opacity: [0, 0.9, 0],
        scale: [0.35, 1.7],
        duration: 820,
        delay: 1320,
        ease: 'outExpo',
      });

      animate('.scenario-result', {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 650,
        delay: 1720,
        ease: 'outExpo',
      });
    });

    return () => scope.revert();
  }, [reducedMotion, replayKey]);

  return (
    <section
      className={`floor-scenario ${reducedMotion ? 'reduced-motion' : ''}`}
      ref={root}
      aria-labelledby="scenario-heading"
    >
      <div className="scenario-heading-row">
        <div>
          <span className="step-label">At the end date</span>
          <h2 id="scenario-heading">Watch the floor hold</h2>
        </div>
        {!reducedMotion && (
          <button type="button" className="replay-button" onClick={() => setReplayKey((key) => key + 1)}>
            Replay
          </button>
        )}
      </div>

      <div className="scenario-chart" aria-hidden="true">
        <svg viewBox="0 0 600 220" preserveAspectRatio="none">
          <defs>
            <linearGradient id="scenario-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#91a9a0" stopOpacity=".2" />
              <stop offset="1" stopColor="#91a9a0" stopOpacity=".75" />
            </linearGradient>
          </defs>
          <polyline className="scenario-curve" points="40,35 150,50 235,72 320,106 400,130 470,170 560,190" />
          <line className="scenario-floor-line" x1="24" y1="130" x2="576" y2="130" />
          <circle className="scenario-crossing-pulse" cx="400" cy="130" r="16" />
          <circle className="scenario-price-dot" cx="40" cy="35" r="7" />
        </svg>
        <span className="scenario-start">Today · {asset}</span>
        <span className="scenario-floor-label">Your floor · {tier.floor}</span>
      </div>

      <div className="scenario-result">
        <span className="scenario-result-mark">Floor active</span>
        <p>
          <strong>{tier.protectedValueAtFloor}</strong>
          <span>protected value at the end date, even if {asset} finishes below the line</span>
        </p>
      </div>

      <p className="scenario-clarifier">
        Nothing pays out when the price crosses this line early. The result is calculated only at the displayed end date.
      </p>
    </section>
  );
}
