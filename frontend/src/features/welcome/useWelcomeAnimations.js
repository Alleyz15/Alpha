import { useEffect } from 'react';
import { animate, createScope, createTimeline, onScroll, stagger, svg } from 'animejs';

const REVEAL_ENTER = '85% start';
const REVEAL_LEAVE = '15% end';

export default function useWelcomeAnimations(rootRef, marketAssetCount = 0) {
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

        const reveal = (targets, trigger, {
          distance = self.matches.compact ? 22 : 36,
          duration = self.matches.compact ? 620 : 780,
          staggerBy = self.matches.compact ? 65 : 100,
          blur = false,
        } = {}) => {
          const nodes = rootRef.current?.querySelectorAll(targets);
          const target = rootRef.current?.querySelector(trigger);
          if (!nodes?.length || !target) return;

          safely(() => {
            animate(nodes, {
              opacity: [.18, 1],
              y: [distance, 0],
              ...(blur ? { filter: ['blur(8px)', 'blur(0px)'] } : {}),
              duration,
              delay: stagger(staggerBy),
              ease: 'outExpo',
              autoplay: onScroll({
                target,
                enter: REVEAL_ENTER,
                leave: REVEAL_LEAVE,
                repeat: false,
              }),
            });
          });
        };

        if (!self.matches.compact) {
          safely(() => {
            animate('.welcome-hero__copy', {
              opacity: [1, .68],
              y: [0, -42],
              ease: 'linear',
              autoplay: onScroll({
                target: '.welcome-hero',
                enter: 'start start',
                leave: 'start end',
                sync: .35,
              }),
            });
          });

          safely(() => {
            animate('.welcome-snapshot', {
              y: [0, 58],
              scale: [1, .975],
              ease: 'linear',
              autoplay: onScroll({
                target: '.welcome-hero',
                enter: 'start start',
                leave: 'start end',
                sync: .4,
              }),
            });
          });

          safely(() => {
            animate('.signal-grid', {
              y: [0, 92],
              opacity: [.58, .18],
              ease: 'linear',
              autoplay: onScroll({
                target: '.welcome-hero',
                enter: 'start start',
                leave: 'start end',
                sync: .5,
              }),
            });
          });
        }

        reveal('.welcome-benefits .welcome-section__heading > *', '.welcome-benefits', { blur: true });
        reveal('.welcome-benefit-card', '.welcome-benefits__grid', { distance: 30, staggerBy: 110 });
        reveal('.welcome-mission > div:first-child > *', '.welcome-mission', { blur: true, staggerBy: 90 });
        reveal('.welcome-mission__identity', '.welcome-mission', { distance: 28 });
        reveal('.welcome-journey .welcome-section__heading > *', '.welcome-journey', { blur: true });
        if (self.matches.compact) {
          reveal('.welcome-journey__mobile > li', '.welcome-journey__mobile', { staggerBy: 75 });
        } else {
          reveal('.welcome-journey__stage', '.welcome-journey__desktop', { distance: 28 });
        }
        reveal('.welcome-market .welcome-section__heading > *', '.welcome-market', { blur: true });
        reveal('.welcome-comparison .welcome-section__heading > *', '.welcome-comparison', { blur: true });
        reveal('.welcome-comparison__card', '.welcome-comparison__grid', { distance: 30, staggerBy: 120 });
        reveal('.welcome-comparison__note', '.welcome-comparison__grid', { distance: 18, duration: 620 });
        reveal('.welcome-reality .welcome-section__heading > *', '.welcome-reality', { blur: true });
        reveal('.welcome-reality-card', '.welcome-reality__grid', { distance: 30, staggerBy: 120 });
        reveal('.welcome-reality__callout', '.welcome-reality__grid', { distance: 18, duration: 620 });
        reveal('.welcome-cta > div > *, .welcome-cta > .alpha-button', '.welcome-cta', { blur: true, staggerBy: 90 });
        reveal('.welcome-footer > *', '.welcome-footer', { distance: 18, duration: 620, staggerBy: 70 });
      });
    } catch {
      scope = null;
    }

    return () => scope?.revert();
  }, [rootRef]);

  useEffect(() => {
    if (!rootRef.current || !marketAssetCount || typeof window.matchMedia !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let scope;
    try {
      scope = createScope({ root: rootRef }).add(() => {
        const cards = rootRef.current?.querySelectorAll('.welcome-market-card');
        const grid = rootRef.current?.querySelector('.welcome-market__grid');
        if (!cards?.length || !grid) return;

        animate(cards, {
          opacity: [.18, 1],
          y: [30, 0],
          duration: 720,
          delay: stagger(90),
          ease: 'outExpo',
          autoplay: onScroll({
            target: grid,
            enter: REVEAL_ENTER,
            leave: REVEAL_LEAVE,
            repeat: false,
          }),
        });
      });
    } catch {
      scope = null;
    }

    return () => scope?.revert();
  }, [marketAssetCount, rootRef]);
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
