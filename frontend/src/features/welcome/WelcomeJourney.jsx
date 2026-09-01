import { useEffect, useRef, useState } from 'react';
import { journeySteps } from './welcomeContent.js';

export default function WelcomeJourney() {
  const [activeStep, setActiveStep] = useState(0);
  const checkpointRefs = useRef([]);

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

  const active = journeySteps[activeStep];

  return (
    <section className="welcome-section welcome-journey" id="how-it-works" aria-labelledby="journey-title">
      <div className="welcome-section__heading">
        <p className="welcome-eyebrow">HOW ALPHA WORKS</p>
        <h2 id="journey-title">From a downside target to a verifiable result</h2>
        <p>Alpha keeps the complex market mechanics behind the interface. The user follows a clear protection journey.</p>
      </div>

      <div className="welcome-journey__desktop">
        <div className="welcome-journey__rail" aria-hidden="true">
          <span style={{ transform: `scaleY(${(activeStep + 1) / journeySteps.length})` }} />
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

        <article className="welcome-journey__stage" aria-live="polite">
          <div className="welcome-journey__stage-index">STEP {active.number} / 06</div>
          <p className="welcome-journey__stage-label">{active.label}</p>
          <h3>{active.title}</h3>
          <p>{active.body}</p>
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
