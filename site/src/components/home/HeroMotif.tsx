'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import gsap from 'gsap';

/**
 * Interactive geometric hero motif with GSAP parallax.
 *
 * 5 SVG layers with different mouse-tracking sensitivity:
 *   outerRing (0.5x) → innerRing (1x) → crossLines (1.5x)
 *   → ellipses (2x) → center (3x)
 *
 * Idle state: gentle floating sine-wave per layer.
 * Mouse near center (<100px): pulse the center ring.
 * Reduced motion: static render, no animations.
 */

const MAX_OFFSET = 15; // px max parallax travel

interface LayerConfig {
  sensitivity: number;
  floatY: number;
  floatDuration: number;
  floatDelay: number;
}

const LAYERS: Record<string, LayerConfig> = {
  outerRing:  { sensitivity: 0.5, floatY: 3,   floatDuration: 4,   floatDelay: 0 },
  innerRing:  { sensitivity: 1.0, floatY: -2,  floatDuration: 3.5, floatDelay: 0.3 },
  crossLines: { sensitivity: 1.5, floatY: 1.5, floatDuration: 6,   floatDelay: 0.6 },
  ellipses:   { sensitivity: 2.0, floatY: 2.5, floatDuration: 5,   floatDelay: 0.9 },
  center:     { sensitivity: 3.0, floatY: 1,   floatDuration: 3,   floatDelay: 1.2 },
};

export default function HeroMotif() {
  const prefersReduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRingRef = useRef<SVGGElement>(null);
  const innerRingRef = useRef<SVGGElement>(null);
  const crossLinesRef = useRef<SVGGElement>(null);
  const ellipsesRef = useRef<SVGGElement>(null);
  const centerRef = useRef<SVGGElement>(null);
  const centerRingRef = useRef<SVGCircleElement>(null);
  const rafId = useRef(0);
  const pulsed = useRef(false);

  const refs: Record<string, React.RefObject<SVGGElement | null>> = {
    outerRing: outerRingRef,
    innerRing: innerRingRef,
    crossLines: crossLinesRef,
    ellipses: ellipsesRef,
    center: centerRef,
  };

  // Idle floating animations
  useEffect(() => {
    if (prefersReduced) return;

    const tweens: gsap.core.Tween[] = [];

    for (const [key, cfg] of Object.entries(LAYERS)) {
      const el = refs[key]?.current;
      if (!el) continue;

      tweens.push(
        gsap.to(el, {
          y: cfg.floatY,
          duration: cfg.floatDuration,
          delay: cfg.floatDelay,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      );
    }

    // Gentle cross-lines rotation
    if (crossLinesRef.current) {
      tweens.push(
        gsap.to(crossLinesRef.current, {
          rotation: 0.5,
          duration: 8,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          transformOrigin: '50% 50%',
        }),
      );
    }

    return () => {
      tweens.forEach((t) => t.kill());
    };
  }, [prefersReduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse parallax handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (prefersReduced) return;

      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = (e.clientX - centerX) / (rect.width / 2); // -1 to 1
        const deltaY = (e.clientY - centerY) / (rect.height / 2);

        for (const [key, cfg] of Object.entries(LAYERS)) {
          const el = refs[key]?.current;
          if (!el) continue;

          gsap.to(el, {
            x: deltaX * cfg.sensitivity * MAX_OFFSET,
            y: deltaY * cfg.sensitivity * MAX_OFFSET + cfg.floatY * Math.sin(Date.now() / 1000),
            duration: 0.8,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        }

        // Center pulse when mouse is near (<25% of container radius)
        const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (dist < 0.25 && !pulsed.current && centerRingRef.current) {
          pulsed.current = true;
          gsap.to(centerRingRef.current, {
            scale: 1.08,
            opacity: 0.9,
            duration: 0.3,
            yoyo: true,
            repeat: 1,
            transformOrigin: '50% 50%',
            onComplete: () => { pulsed.current = false; },
          });
        }
      });
    },
    [prefersReduced], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleMouseLeave = useCallback(() => {
    if (prefersReduced) return;

    cancelAnimationFrame(rafId.current);
    for (const [key] of Object.entries(LAYERS)) {
      const el = refs[key]?.current;
      if (!el) continue;

      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 1.2,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
  }, [prefersReduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] z-[1] opacity-40 max-md:w-[400px] max-md:h-[400px]"
      style={{ willChange: 'transform' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 800 800"
        style={prefersReduced ? undefined : { animation: 'rotateMotif 120s linear infinite' }}
      >
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c6a87c" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#e8d9bb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#9a7d52" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Layer 1: Outer rings */}
        <g ref={outerRingRef}>
          <circle cx="400" cy="400" r="350" fill="none" stroke="url(#goldGrad)" strokeWidth="0.5" strokeDasharray="4 4" />
        </g>

        {/* Layer 2: Inner ring */}
        <g ref={innerRingRef}>
          <circle cx="400" cy="400" r="250" fill="none" stroke="url(#goldGrad)" strokeWidth="1" />
        </g>

        {/* Layer 3: Cross lines */}
        <g ref={crossLinesRef} stroke="url(#goldGrad)" strokeWidth="0.5" opacity="0.5">
          <line x1="400" y1="0" x2="400" y2="800" />
          <line x1="0" y1="400" x2="800" y2="400" />
          <line x1="117" y1="117" x2="683" y2="683" />
          <line x1="117" y1="683" x2="683" y2="117" />
        </g>

        {/* Layer 4: Orbital ellipses */}
        <g ref={ellipsesRef}>
          <ellipse cx="400" cy="400" rx="300" ry="150" fill="none" stroke="url(#goldGrad)" strokeWidth="2" transform="rotate(30 400 400)" />
          <ellipse cx="400" cy="400" rx="300" ry="150" fill="none" stroke="url(#goldGrad)" strokeWidth="2" transform="rotate(-30 400 400)" />
        </g>

        {/* Layer 5: Center group */}
        <g ref={centerRef}>
          <circle cx="400" cy="400" r="20" fill="url(#goldGrad)" />
          <circle ref={centerRingRef} cx="400" cy="400" r="80" fill="none" stroke="url(#goldGrad)" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
