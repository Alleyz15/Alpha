import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import { journeySteps } from './welcomeContent.js';

const SPOKE_ANGLES = [0, 60, 120, 180, 240, 300];
const OUTER_POINTS = '212,120 166,200 74,200 28,120 74,40 166,40';
const MID_POINTS = '120,58 174,151 66,151';

function hexNodePoint(angleDeg, radius = 92) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 120 + radius * Math.cos(rad), y: 120 + radius * Math.sin(rad) };
}

/*
 * A small counter-rotating mechanism, not a glow effect: three nested rings
 * (hexagon / triangle / square) spin against each other continuously like
 * gears, with spokes and vertex nodes to read as structure rather than
 * decoration. The ring matching the current step (index mod 3) lights up and
 * pulses on change - the mechanism visibly reconfiguring as the user moves
 * through the steps, echoing "Alpha keeps the complex market mechanics
 * behind the interface" without literally illustrating an options chain.
 */
function StageMechanism({ activeStep }) {
  const mechRef = useRef(null);

  useLayoutEffect(() => {
    if (!mechRef.current || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const animations = [];
    try {
      animations.push(animate(mechRef.current.querySelector('.welcome-journey__mech-ring--outer'), {
        rotate: '1turn',
        duration: 26000,
        loop: true,
        ease: 'linear',
      }));
      animations.push(animate(mechRef.current.querySelector('.welcome-journey__mech-ring--mid'), {
        rotate: '-1turn',
        duration: 17000,
        loop: true,
        ease: 'linear',
      }));
      animations.push(animate(mechRef.current.querySelector('.welcome-journey__mech-ring--inner'), {
        rotate: '1turn',
        duration: 11000,
        loop: true,
        ease: 'linear',
      }));
    } catch {
      // Ambient rotation is decoration; step content works without it.
    }

    return () => animations.forEach((a) => a?.revert?.());
  }, []);

  useEffect(() => {
    if (!mechRef.current || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let animation;
    try {
      animation = animate(mechRef.current.querySelectorAll('.welcome-journey__mech-ring, .welcome-journey__mech-node.is-active'), {
        scale: [1, 1.12, 1],
        duration: 640,
        ease: 'outElastic(1, .6)',
      });
    } catch {
      animation = null;
    }
    return () => animation?.revert?.();
  }, [activeStep]);

  const highlight = activeStep % 3;

  return (
    <svg className="welcome-journey__mechanism" viewBox="0 0 240 240" aria-hidden="true" ref={mechRef}>
      <g className="welcome-journey__mech-spokes">
        {SPOKE_ANGLES.map((angle) => {
          const { x, y } = hexNodePoint(angle);
          return <line key={angle} x1="120" y1="120" x2={x} y2={y} />;
        })}
      </g>
      <polygon
        className={`welcome-journey__mech-ring welcome-journey__mech-ring--outer${highlight === 0 ? ' is-active' : ''}`}
        points={OUTER_POINTS}
      />
      <polygon
        className={`welcome-journey__mech-ring welcome-journey__mech-ring--mid${highlight === 1 ? ' is-active' : ''}`}
        points={MID_POINTS}
      />
      <rect
        className={`welcome-journey__mech-ring welcome-journey__mech-ring--inner${highlight === 2 ? ' is-active' : ''}`}
        x="98" y="98" width="44" height="44"
      />
      <g className="welcome-journey__mech-nodes">
        {SPOKE_ANGLES.map((angle, index) => {
          const { x, y } = hexNodePoint(angle);
          return (
            <circle
              key={angle}
              className={`welcome-journey__mech-node${index === activeStep % SPOKE_ANGLES.length ? ' is-active' : ''}`}
              cx={x} cy={y} r="4.5"
            />
          );
        })}
      </g>
    </svg>
  );
}

/*
 * A field of hexagon outlines drifting slowly behind the step rail - the
 * "something is always moving back here" layer, borrowed in spirit (not in
 * markup) from the kind of continuous background motion sites like sui.io use
 * for their systems diagrams. Kept to slow rotation and a gentle float so it
 * reads as ambient texture rather than competing with the step copy in front
 * of it.
 */
function JourneyBackdrop() {
  return (
    <svg className="welcome-journey__backdrop" viewBox="0 0 640 1200" fill="none" aria-hidden="true">
      <polygon className="welcome-journey__poly welcome-journey__poly--one" points="110,40 190,84 190,172 110,216 30,172 30,84" />
      <polygon className="welcome-journey__poly welcome-journey__poly--two" points="560,180 630,220 630,300 560,340 490,300 490,220" />
      <polygon className="welcome-journey__poly welcome-journey__poly--three" points="580,700 660,745 660,835 580,880 500,835 500,745" />
      <polygon className="welcome-journey__poly welcome-journey__poly--four" points="90,880 165,923 165,1009 90,1052 15,1009 15,923" />
      <polygon className="welcome-journey__poly welcome-journey__poly--five" points="330,1000 380,1029 380,1087 330,1116 280,1087 280,1029" />
    </svg>
  );
}

export default function WelcomeJourney() {
  const [activeStep, setActiveStep] = useState(0);
  const checkpointRefs = useRef([]);
  const stageRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveStep(Number(visible.target.dataset.step));
    }, { rootMargin: '-38% 0px -38% 0px', threshold: [0, .25, .6] });

    checkpointRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  // The backdrop's continuous drift - independent of which step is active, so
  // it runs once for the section's lifetime rather than restarting per step.
  // useLayoutEffect for the same reason as useWelcomeAnimations.js: this is
  // an animation START state, and it must be in place before first paint.
  useLayoutEffect(() => {
    if (!sectionRef.current || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const animations = [];
    try {
      animations.push(animate(sectionRef.current.querySelectorAll('.welcome-journey__poly--one, .welcome-journey__poly--three'), {
        rotate: '1turn',
        duration: 46000,
        loop: true,
        ease: 'linear',
      }));
      animations.push(animate(sectionRef.current.querySelectorAll('.welcome-journey__poly--two, .welcome-journey__poly--four'), {
        rotate: '-1turn',
        duration: 58000,
        loop: true,
        ease: 'linear',
      }));
      animations.push(animate('.welcome-journey__poly--five', {
        rotate: '1turn',
        duration: 36000,
        loop: true,
        ease: 'linear',
      }));
      animations.push(animate(sectionRef.current.querySelectorAll('.welcome-journey__poly'), {
        translateY: [-12, 12],
        duration: (_, i) => 5200 + i * 640,
        delay: stagger(220),
        alternate: true,
        loop: true,
        ease: 'inOutSine',
      }));
      animations.push(animate('.welcome-journey__rail-pulse', {
        top: ['0%', '100%'],
        opacity: [0, 1, 1, 0],
        duration: 2600,
        loop: true,
        ease: 'inOutSine',
      }));
    } catch {
      // Ambient motion is decoration; the step content must still work without it.
    }

    return () => animations.forEach((a) => a?.revert?.());
  }, []);

  useLayoutEffect(() => {
    if (!stageRef.current || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let animation;
    try {
      animation = animate(
        stageRef.current.querySelectorAll('.welcome-journey__stage-label, h3, p:last-of-type'),
        {
          opacity: [.3, 1],
          y: [22, 0],
          duration: 620,
          delay: (_, index) => index * 70,
          ease: 'outBack(1.5)',
        },
      );
    } catch {
      animation = null;
    }

    return () => animation?.revert?.();
  }, [activeStep]);

  const active = journeySteps[activeStep];

  return (
    <section className="welcome-section welcome-journey" id="how-it-works" aria-labelledby="journey-title" ref={sectionRef}>
      <div className="welcome-section__heading">
        <p className="welcome-eyebrow">HOW ALPHA WORKS</p>
        <h2 id="journey-title">From a downside target to a verifiable result</h2>
        <p>Alpha keeps the complex market mechanics behind the interface. The user follows a clear protection journey.</p>
      </div>

      <div className="welcome-journey__desktop">
        <JourneyBackdrop />
        <div className="welcome-journey__rail" aria-hidden="true">
          <span style={{ transform: `scaleY(${(activeStep + 1) / journeySteps.length})` }} />
          <i className="welcome-journey__rail-pulse" />
        </div>
        <div className="welcome-journey__checkpoints">
          {journeySteps.map((step, index) => (
            <div
              className="welcome-journey__checkpoint"
              data-step={index}
              key={step.number}
              ref={(node) => { checkpointRefs.current[index] = node; }}
            >
              <span className={index <= activeStep ? 'is-active' : ''}>{step.number}</span>
              <small>{step.label}</small>
            </div>
          ))}
        </div>

        <article className="welcome-journey__stage" aria-live="polite" ref={stageRef}>
          <div className="welcome-journey__stage-index">STEP {active.number} / 06</div>
          <p className="welcome-journey__stage-label">{active.label}</p>
          <h3>{active.title}</h3>
          <p>{active.body}</p>
          <StageMechanism activeStep={activeStep} />
          <div className="welcome-journey__nodes" aria-hidden="true">
            {journeySteps.map((step, index) => (
              <span key={step.number} className={index === activeStep ? 'is-active' : ''}>{step.number}</span>
            ))}
          </div>
        </article>
      </div>

      <ol className="welcome-journey__mobile">
        {journeySteps.map((step) => (
          <li key={step.number}>
            <span>{step.number}</span>
            <div>
              <small>{step.label}</small>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
