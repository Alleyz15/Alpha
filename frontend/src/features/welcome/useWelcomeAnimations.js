import { useEffect } from 'react';
import { animate, createScope, createTimeline, onScroll, stagger, svg } from 'animejs';

export default function useWelcomeAnimations(rootRef) {
  useEffect(() => {
    if (!rootRef.current || typeof window.matchMedia !== 'function') return undefined;

    let scope;
    try {
      scope = createScope({
        root: rootRef,
        mediaQueries: {
          reduceMotion: '(prefers-reduced-motion: reduce)',
          compact: '(max-width: 820px)',
        },
      }).add((self) => {
        if (self.matches.reduceMotion) return;

        const safely = (motion) => {
          try {
            motion();
          } catch {
            // Motion is progressive enhancement; content must remain usable.
          }
        };

        safely(() => {
          createTimeline({ defaults: { ease: 'outExpo' } })
            .add('.welcome-hero__eyebrow', { opacity: [.55, 1], y: [16, 0], duration: 650 })
            .add('.welcome-hero__title-line', {
              opacity: [.45, 1],
              y: [32, 0],
              duration: 820,
              delay: stagger(110),
            }, '-=420')
            .add('.welcome-hero__intro, .welcome-hero__actions, .welcome-hero__facts', {
              opacity: [.6, 1],
              y: [20, 0],
              duration: 650,
              delay: stagger(90),
            }, '-=500')
            .add('.welcome-snapshot', { opacity: [.55, 1], x: [30, 0], duration: 760 }, '-=620');
        });

        safely(() => {
          animate(svg.createDrawable('.signal-grid__path'), {
            draw: ['0 0', '0 1'],
            duration: 1800,
            delay: stagger(260),
            ease: 'inOutCubic',
          });
        });

        safely(() => {
          animate('.signal-grid__pulse--one', {
            ...svg.createMotionPath('.signal-grid__route--one'),
            duration: 5600,
            ease: 'linear',
            loop: true,
          });
          animate('.signal-grid__pulse--two', {
            ...svg.createMotionPath('.signal-grid__route--two'),
            duration: 6800,
            delay: 900,
            ease: 'linear',
            loop: true,
          });
          animate('.signal-grid__halo', {
            scale: [.75, 1.2],
            opacity: [.35, .75],
            duration: 2200,
            alternate: true,
            loop: true,
            ease: 'inOutSine',
          });
        });

        if (!self.matches.compact) {
          safely(() => {
            animate('.welcome-benefit-card', {
              opacity: [.62, 1],
              y: [26, 0],
              duration: 720,
              delay: stagger(110),
              autoplay: onScroll({ target: '.welcome-benefits__grid' }),
            });
          });

          const marketCards = rootRef.current?.querySelectorAll('.welcome-market-card');
          const marketGrid = rootRef.current?.querySelector('.welcome-market__grid');
          if (marketCards?.length && marketGrid) {
            safely(() => {
              animate(marketCards, {
                opacity: [.62, 1],
                y: [24, 0],
                duration: 700,
                delay: stagger(90),
                autoplay: onScroll({ target: marketGrid }),
              });
            });
          }

          safely(() => {
            animate('.welcome-reality-card', {
              opacity: [.62, 1],
              y: [28, 0],
              duration: 760,
              delay: stagger(120),
              autoplay: onScroll({ target: '.welcome-reality__grid' }),
            });
          });
        }
      });
    } catch {
      scope = null;
    }

    return () => scope?.revert();
  }, [rootRef]);
}

export function pulseMarketSnapshot(rootRef) {
  if (!rootRef.current || typeof window.matchMedia !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  try {
    const values = rootRef.current.querySelectorAll('[data-market-value]');
    if (values.length === 0) return;
    animate(values, {
      color: ['var(--signal)', 'var(--text)'],
      scale: [1.025, 1],
      duration: 700,
      delay: stagger(55),
      ease: 'outCubic',
    });
  } catch {
    // Live data remains visible even if the refresh accent cannot run.
  }
}
