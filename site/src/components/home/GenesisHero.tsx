'use client';

import { useEffect, useRef } from 'react';

/**
 * GenesisHero — the brand mark materializing from a brass particle swarm.
 * Wraps the framework-agnostic GenesisEngine (Three.js + UnrealBloom). The mark
 * converges on arrival (progress 0->1), reacts to the pointer, then drifts/pulses
 * forever. Desktop-only + lazy (three loads on mount) + reduced-motion → static
 * assembled frame; fully disposed on unmount.
 */
export default function GenesisHero({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Desktop-gate: no WebGL on small screens (the seal is hidden there anyway).
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cancelled = false;
    let tweenRaf = 0;
    let onResize: (() => void) | null = null;
    let onPointer: ((e: PointerEvent) => void) | null = null;
    let onScroll: (() => void) | null = null;
    let onVisibility: (() => void) | null = null;
    let io: IntersectionObserver | null = null;
    let engine: import('@/lib/genesis/GenesisEngine').GenesisEngine | null = null;

    import('@/lib/genesis/GenesisEngine')
      .then(({ GenesisEngine }) => {
        if (cancelled || !canvas) return;
        engine = new GenesisEngine(canvas, { reduced, quality: 'high' });

        const fit = () => {
          const r = canvas.getBoundingClientRect();
          engine?.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
        };
        fit();
        onResize = fit;
        window.addEventListener('resize', onResize);

        onPointer = (e: PointerEvent) => {
          const r = canvas.getBoundingClientRect();
          engine?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
        };
        window.addEventListener('pointermove', onPointer, { passive: true });

        engine.start();

        if (reduced) {
          engine.setProgress(1);
          return;
        }
        // Assemble on arrival: ease the swarm into the mark over ~2.8s.
        const DUR = 2800;
        const startT = performance.now();
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
        const tick = (now: number) => {
          if (cancelled || !engine) return;
          const t = Math.min(1, (now - startT) / DUR);
          engine.setProgress(easeOut(t));
          if (t < 1) tweenRaf = requestAnimationFrame(tick);
        };
        tweenRaf = requestAnimationFrame(tick);

        // Pinned-hero scroll beat: when mounted inside the sticky scroll-track, map the
        // page's progress through that track to the engine's scroll "dive in". The track
        // is resolved lazily — the parent flips [data-genesis-track] on in its own effect.
        let track: HTMLElement | null = null;
        onScroll = () => {
          if (!track) track = canvas.closest('[data-genesis-track]') as HTMLElement | null;
          if (!track || !engine) return;
          const r = track.getBoundingClientRect();
          const span = r.height - window.innerHeight;
          engine.setScroll(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        // Pause the render loop (UnrealBloom is expensive) whenever the hero is off-screen
        // or the tab is hidden — it otherwise runs at full FPS behind every section below.
        let running = true;
        let inView = true;
        const applyVisibility = () => {
          const should = inView && !document.hidden;
          if (should && !running) { engine?.start(); running = true; }
          else if (!should && running) { engine?.stop(); running = false; }
        };
        io = new IntersectionObserver((entries) => {
          inView = entries[0]?.isIntersecting ?? false;
          applyVisibility();
        }, { threshold: 0 });
        io.observe(canvas);
        onVisibility = applyVisibility;
        document.addEventListener('visibilitychange', onVisibility);
      })
      .catch(() => {
        /* WebGL unavailable — leave the canvas empty; the hero still reads. */
      });

    return () => {
      cancelled = true;
      if (tweenRaf) cancelAnimationFrame(tweenRaf);
      if (onResize) window.removeEventListener('resize', onResize);
      if (onPointer) window.removeEventListener('pointermove', onPointer);
      if (onScroll) window.removeEventListener('scroll', onScroll);
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
      engine?.dispose();
    };
  }, []);

  // Radial mask sized to the NEAREST edge (closest-side), reaching full transparency
  // well before the square canvas edge, so the additive-blend / bloom haze can never
  // paint a rectangle or edge-line around the mark.
  const mask = 'radial-gradient(circle closest-side at 50% 50%, #000 0%, #000 66%, transparent 88%)';
  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
