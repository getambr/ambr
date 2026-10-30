'use client';

/**
 * ShaderOrb — a compact, self-contained glowing core built from OUR local shader engine
 * (gradient/beam/grain + ACES tone-map + IGN dither, the :8800 demo distilled). Additive,
 * transparent — meant to sit in the hollow centre of the Unicorn ring as the focal element.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ShaderOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2() },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime; uniform vec2 uRes, uMouse;
        float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
          float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
          vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
        float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
        vec3 lin2srgb(vec3 c){ return mix(1.055*pow(max(c,0.0),vec3(1.0/2.4))-0.055, c*12.92, step(c,vec3(0.0031308))); }
        float ign(vec2 p){ return fract(52.9829189*fract(0.06711056*p.x+0.00583715*p.y)); }
        void main(){
          vec2 uv = vUv; vec2 c = uv - 0.5; float r = length(c);
          float core = exp(-r*r*6.5);
          float f = fbm(uv*3.6 + uTime*0.06);
          vec3 brass = mix(vec3(0.42,0.30,0.15), vec3(0.95,0.82,0.55), f);
          vec3 col = core * brass * 1.25;
          // crossing soft beams that breathe
          float b1 = exp(-pow(abs(c.x*0.72 - c.y*0.69), 2.0) / (2.0*0.018));
          float b2 = exp(-pow(abs(c.x*0.69 + c.y*0.72), 2.0) / (2.0*0.026));
          col += (b1*(0.55+0.45*fbm(uv*5.0+uTime*0.12)) + b2*0.4) * brass * core * 1.8;
          // pointer lift
          float md = length(uv - uMouse);
          col += exp(-md*md*16.0) * 0.30 * brass;
          // fine grain inside the core
          col += (hash(uv*uRes + uTime) - 0.5) * 0.03 * core;
          col = aces(col * 1.3);
          vec3 srgb = lin2srgb(col);
          srgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(srgb, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      renderer.setPixelRatio(Math.min(devicePixelRatio, reduced ? 1 : 1.75));
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    };
    fit();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);

    const target = new THREE.Vector2(0.5, 0.5);
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let raf = 0;
    const clock = new THREE.Clock();
    const render = () => { uniforms.uMouse.value.lerp(target, 0.06); renderer.render(scene, camera); };
    if (reduced) { render(); }
    else {
      const loop = () => { uniforms.uTime.value = clock.getElapsedTime(); render(); raf = requestAnimationFrame(loop); };
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
      mat.dispose(); renderer.dispose();
    };
  }, []);

  // radial CSS mask so the square canvas reads as a soft circular core
  const mask = 'radial-gradient(circle closest-side at 50% 50%, #000 0%, #000 58%, transparent 82%)';
  return <canvas ref={canvasRef} className={className} aria-hidden="true" style={{ maskImage: mask, WebkitMaskImage: mask }} />;
}
