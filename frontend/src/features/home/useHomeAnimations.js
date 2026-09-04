import { useEffect } from 'react';
import { animate, createScope, createTimeline, stagger } from 'animejs';

export default function useHomeAnimations(rootRef, marketKey) {
  useEffect(() => {
    if (!rootRef.current || typeof window.matchMedia !== 'function') return undefined;
    let scope;
    try {
      scope = createScope({
        root: rootRef,
        mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
      }).add((self) => {
        if (self.matches.reduceMotion) return;
        const safely = (motion) => {
          try { motion(); } catch { /* Motion never controls content. */ }
        };

        safely(() => {
          createTimeline({ defaults: { ease: 'outExpo' } })
            .add('.home-portfolio-card', { opacity: [.68, 1], y: [22, 0], duration: 760 })
            .add('.home-trending-card', {
              opacity: [.65, 1],
              y: [18, 0],
              duration: 620,
              delay: stagger(80),
            }, '-=420')
            .add('.home-market-panel', { opacity: [.7, 1], y: [18, 0], duration: 620 }, '-=400');
        });

        safely(() => {
          animate('.home-data-orbit', {
            rotate: '1turn',
            duration: 18_000,
            loop: true,
            ease: 'linear',
          });
          animate('.home-data-node', {
            scale: [.85, 1.18],
            opacity: [.45, 1],
            duration: 1800,
            delay: stagger(360),
            alternate: true,
            loop: true,
            ease: 'inOutSine',
          });
          animate('.home-live-dot', {
            scale: [.8, 1.35],
            opacity: [.55, 1],
            duration: 1200,
            alternate: true,
            loop: true,
            ease: 'inOutSine',
          });
        });
      });
    } catch {
      scope = null;
    }
    return () => scope?.revert();
  }, [rootRef]);

  useEffect(() => {
    if (!marketKey || !rootRef.current || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      animate(rootRef.current.querySelectorAll('.home-market-row'), {
        backgroundColor: ['var(--signal-tint)', 'var(--surface)'],
        duration: 720,
        delay: stagger(55),
        ease: 'outCubic',
      });
    } catch {
      // Refreshed values are already present; the accent is optional.
    }
  }, [marketKey, rootRef]);
}

