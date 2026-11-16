import * as THREE from 'three';
import { gsap } from 'gsap';
import { MandateArt, ART_W, ART_H, STATES, type Fonts } from './mandateArt';

/**
 * The hero mandate: one document that assembles itself through the six states (drafted, terms,
 * signed, hashed, anchored on Base, executed) and can come apart into its layers. Framework-free;
 * the React shell (components/home/HeroTeardown.tsx) owns the DOM around it.
 *
 * One value drives everything: `st.t` runs 0..6 through the states, `st.ex` 0..1 takes it apart.
 * The tour, the state buttons, the take-apart toggle and the scroll all move those two numbers.
 */

export type TeardownOptions = {
  fonts: Fonts;
  reduced: boolean;
  compact: boolean;
  /** Called when the visible state or its progress changes, for the state rail. */
  onState?: (idx: number, t: number) => void;
  /** Called when the take-apart target changes (tour or user). */
  onApart?: (apart: boolean) => void;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const BRASS = new THREE.Color('#c6a87c');
const DW = 2.4;
const DH = 3.2;
const BLOCK_GAP = 1.1;
const RESUME_AFTER_MS = 12000;

type Layer = { g: THREE.Group; m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; e: THREE.LineSegments };
type Block = { g: THREE.Group; body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; e: THREE.LineSegments };
type Tex = { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string | number };

export class TeardownEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private root = new THREE.Group();
  private art: MandateArt;
  private tex: Tex[] = [];
  private layers: Layer[] = [];
  private blocks: Block[] = [];
  private links: THREE.Line[] = [];
  private sweep!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private labels: HTMLDivElement[] = [];
  private labelHost: HTMLDivElement;

  private st = { t: 0, ex: 0 };
  private scrollEx = 0;
  private apartTarget = false;
  private tl: gsap.core.Timeline | null = null;
  private resumeTimer = 0;
  private raf = 0;
  private frame = 0;
  private visible = true;
  private dirty = true;
  private lastState = '';
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private size = { w: 1, h: 1 };
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposables: { dispose(): void }[] = [];

  constructor(private host: HTMLElement, private opts: TeardownOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.compact ? 1.25 : 1.5));
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);
    this.labelHost = document.createElement('div');
    this.labelHost.className = 'ht-lbls';
    host.appendChild(this.labelHost);

    // closer on small screens, where the stage is the full column width
    this.camera.position.set(0, 0, opts.compact ? 8.6 : 9.1);
    this.scene.add(this.root);
    this.art = new MandateArt(opts.fonts);
    this.build();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.tl) {
        if (this.visible) this.tl.resume();
        else this.tl.pause();
      }
    });
    this.io.observe(host);
    if (!opts.reduced && window.matchMedia('(hover: hover)').matches) window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.resize();
  }

  start() {
    if (this.opts.reduced) {
      this.st.t = 6;
      this.st.ex = 0;
      this.dirty = true;
    } else {
      this.playTour();
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Jump to a state (0-5). */
  goto(i: number) {
    this.takeOver();
    this.setApartTarget(false);
    if (this.opts.reduced) {
      this.st.t = i + 1;
      this.st.ex = 0;
      this.dirty = true;
      return;
    }
    gsap.to(this.st, { t: i + 1, ex: 0, duration: 1.1, ease: 'power3.out', overwrite: true });
  }

  toggleApart() {
    this.takeOver();
    const on = !this.apartTarget;
    this.setApartTarget(on);
    if (this.opts.reduced) {
      if (on) this.st.t = 6;
      this.st.ex = on ? 1 : 0;
      this.dirty = true;
      return;
    }
    if (on && this.st.t < 6) gsap.to(this.st, { t: 6, duration: 1.2, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(this.st, { ex: on ? 1 : 0, duration: 1.5, ease: 'power3.inOut', overwrite: 'auto' });
  }

  /** 0 at the top of the hero, 1 once it has scrolled out: the layers part as you scroll away. */
  setScroll(p: number) {
    if (this.opts.reduced) return;
    const v = clamp01((p - 0.05) / 0.5);
    this.scrollEx = v * v * (3 - 2 * v);
  }

  /** Stop the tour and hold one exact frame, for screenshot checks. */
  freeze(t: number, ex = 0) {
    this.tl?.kill();
    this.tl = null;
    clearTimeout(this.resumeTimer);
    gsap.killTweensOf(this.st);
    this.st.t = t;
    this.st.ex = ex;
    this.dirty = true;
  }

  /** The four plates flattened into one image, for checking the artwork's layout. */
  artPreview() {
    const c = document.createElement('canvas');
    c.width = ART_W;
    c.height = ART_H;
    const ctx = c.getContext('2d')!;
    this.tex.forEach((T) => ctx.drawImage(T.ctx.canvas, 0, 0));
    return c.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.resumeTimer);
    this.tl?.kill();
    gsap.killTweensOf(this.st);
    this.ro.disconnect();
    this.io.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelHost.remove();
  }

  // ---------------------------------------------------------------- tour

  private playTour() {
    clearTimeout(this.resumeTimer);
    this.tl?.kill();
    gsap.killTweensOf(this.st);
    const st = this.st;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
    tl.set(st, { t: 0, ex: 0 });
    tl.call(() => this.setApartTarget(false));
    // one steady beat per state: writing is linear, plates arrive fast and settle, then hold
    tl.to(st, { t: 1, duration: 2.2, ease: 'power1.inOut' }).to({}, { duration: 0.6 });
    for (let i = 2; i <= 4; i++) tl.to(st, { t: i, duration: 1.1, ease: 'power3.out' }).to({}, { duration: 0.6 });
    // the blocks arrive one by one inside this span, so it runs on linear time
    tl.to(st, { t: 5, duration: 2.4, ease: 'none' }).to({}, { duration: 0.5 });
    tl.to(st, { t: 6, duration: 1.4, ease: 'none' }).to({}, { duration: 1.8 });
    tl.call(() => this.setApartTarget(true));
    tl.to(st, { ex: 1, duration: 1.6, ease: 'power3.inOut' }).to({}, { duration: 3 });
    tl.call(() => this.setApartTarget(false));
    tl.to(st, { ex: 0, duration: 1.4, ease: 'power3.inOut' }).to({}, { duration: 4 });
    // rewind: the plates leave and the text unwrites, then it starts over
    tl.to(st, { t: 0, duration: 1.6, ease: 'power2.in' });
    if (!this.visible) tl.pause();
    this.tl = tl;
  }

  private takeOver() {
    this.tl?.kill();
    this.tl = null;
    clearTimeout(this.resumeTimer);
    if (!this.opts.reduced) this.resumeTimer = window.setTimeout(() => this.playTour(), RESUME_AFTER_MS);
  }

  private setApartTarget(on: boolean) {
    if (this.apartTarget === on) return;
    this.apartTarget = on;
    this.opts.onApart?.(on);
  }

  // ---------------------------------------------------------------- scene

  private canvasTex(): Tex {
    const c = document.createElement('canvas');
    c.width = ART_W;
    c.height = ART_H;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    // upload premultiplied, so transparent texels keep their colour and edges never fringe dark
    tex.premultiplyAlpha = true;
    this.disposables.push(tex);
    return { ctx: c.getContext('2d')!, tex, key: -1 };
  }

  /** Premultiplied blending: the texture is premultiplied, and opacity scales colour and alpha together. */
  private plateMaterial(map: THREE.Texture) {
    const m = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.disposables.push(m);
    return m;
  }

  private edges(geo: THREE.BufferGeometry) {
    const g = new THREE.EdgesGeometry(geo);
    // depthWrite off: a faded outline must never hide what is behind it
    const m = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0, depthWrite: false });
    this.disposables.push(g, m);
    return new THREE.LineSegments(g, m);
  }

  private build() {
    const planeGeo = new THREE.PlaneGeometry(DW, DH);
    this.disposables.push(planeGeo);
    for (let i = 0; i < 4; i++) {
      const T = this.canvasTex();
      this.tex.push(T);
      const g = new THREE.Group();
      const m = new THREE.Mesh(planeGeo, this.plateMaterial(T.tex));
      // back to front: prose, terms, signatures, hash; each outline draws right after its own plate,
      // so a plate in front is never cut by the paper behind it
      m.renderOrder = 10 + i;
      const e = this.edges(planeGeo);
      e.renderOrder = 10.5 + i;
      g.add(m, e);
      this.root.add(g);
      this.layers.push({ g, m, e });
    }

    const blockGeo = new THREE.BoxGeometry(2.7, 3.5, 0.22);
    this.disposables.push(blockGeo);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x0f0e0b, transparent: true, opacity: 0, depthWrite: false });
      this.disposables.push(mat);
      const body = new THREE.Mesh(blockGeo, mat);
      body.renderOrder = 1;
      const e = this.edges(blockGeo);
      g.add(body, e);
      this.root.add(g);
      this.blocks.push({ g, body, e });
    }
    // links between neighbouring blocks, along their right edges
    for (let i = 0; i < 2; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0, depthWrite: false });
      this.disposables.push(geo, mat);
      const line = new THREE.Line(geo, mat);
      this.root.add(line);
      this.links.push(line);
    }

    // the execution sweep: one band of light that passes down the finished document
    const sc = document.createElement('canvas');
    sc.width = 8;
    sc.height = 128;
    const sctx = sc.getContext('2d')!;
    const grad = sctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(232,217,187,0)');
    grad.addColorStop(0.5, 'rgba(232,217,187,0.55)');
    grad.addColorStop(1, 'rgba(232,217,187,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 8, 128);
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    const smat = new THREE.MeshBasicMaterial({ map: stex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const sgeo = new THREE.PlaneGeometry(DW, 0.5);
    this.disposables.push(stex, smat, sgeo);
    this.sweep = new THREE.Mesh(sgeo, smat);
    this.sweep.renderOrder = 20;
    this.root.add(this.sweep);

    const names: [string, string][] = [
      ['Prose', 'read by people'],
      ['Terms', 'run by code'],
      ['Signatures', 'who agreed'],
      ['Hash', 'fingerprint'],
      ['Base block', 'anchored'],
    ];
    this.labels = names.map(([title, sub]) => {
      const d = document.createElement('div');
      d.className = 'ht-lbl';
      d.innerHTML = `${title}<em>${sub}</em>`;
      this.labelHost.appendChild(d);
      return d;
    });
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.size = { w: r.width, h: r.height };
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden) return;
    if (this.opts.reduced && !this.dirty) return;
    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.05;
    p.y += (p.ty - p.y) * 0.05;
    this.apply(now / 1000);
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  };

  private setOpacity(m: THREE.MeshBasicMaterial, v: number) {
    m.opacity = v;
    m.color.setScalar(v); // premultiplied: colour fades with alpha
  }

  private redraw(i: number, key: string | number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const T = this.tex[i];
    if (T.key === key) return;
    T.key = key;
    draw(T.ctx);
    T.tex.needsUpdate = true;
  }

  private apply(time: number) {
    this.frame++;
    const { st, art } = this;
    const a = STATES.map((_, i) => clamp01(st.t - i));
    const idx = Math.min(5, Math.max(0, Math.ceil(st.t) - 1));
    const started = st.t > 0.02;

    // ---- artwork
    const write = easeInOut(a[0]);
    this.redraw(0, `${Math.round(write * 400)}|${started ? idx : -1}`, (c) => art.paper(c, write, started ? idx : -1));
    this.redraw(1, Math.round(a[1] * 60), (c) => art.terms(c, a[1]));
    this.redraw(2, Math.round(a[2] * 120), (c) => art.sigs(c, a[2]));
    this.redraw(3, a[3] >= 1 ? 'done' : a[3] > 0 ? this.frame : 'none', (c) => art.hash(c, a[3], this.frame));

    // ---- layers: each plate arrives from the front right and settles onto the sheet
    const ex = Math.max(easeInOut(st.ex), this.scrollEx);
    this.layers.forEach((L, i) => {
      const e = i === 0 ? 1 : easeOut(a[i]);
      L.g.position.set((1 - e) * 1.6, (1 - e) * 0.2 + ex * i * 0.06, lerp(i * 0.004, i * 1.0, ex) + (1 - e) * 1.1);
      L.g.rotation.y = (1 - e) * -0.45;
      this.setOpacity(L.m.material, i === 0 ? clamp01(st.t * 4) : e);
      (L.e.material as THREE.LineBasicMaterial).opacity = (i === 0 ? 0.35 : 0.55 * e) * ex;
    });

    // ---- the chain: the two earlier blocks slide in from the back one by one, then this
    // mandate's block slides up behind the document; the links draw as each one lands
    const p = a[4];
    const k = [easeOut(clamp01((p - 0.5) / 0.42)), easeOut(clamp01((p - 0.22) / 0.4)), easeOut(clamp01(p / 0.4))];
    const flare = a[5] > 0 && a[5] < 1 ? Math.sin(a[5] * Math.PI) : 0;
    this.blocks.forEach((B, i) => {
      const z = -0.24 - i * (BLOCK_GAP + ex * 0.1) - ex * 0.35;
      if (i === 0) B.g.position.set(0, lerp(-1.6, 0, k[0]), z);
      else B.g.position.set(0, 0, lerp(z - 3.2, z, k[i]));
      B.body.material.opacity = k[i] * (i === 0 ? 0.95 : 0.7);
      (B.e.material as THREE.LineBasicMaterial).opacity = k[i] * (i === 0 ? 0.7 + 0.3 * flare : 0.4);
    });
    const xEdge = 1.35;
    this.links.forEach((line, i) => {
      // link i joins block i+1 to block i, drawn from the older block towards the newer one
      const from = this.blocks[i + 1].g.position;
      const to = this.blocks[i].g.position;
      const draw = i === 1 ? clamp01((p - 0.5) / 0.2) : clamp01((p - 0.85) / 0.15);
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, xEdge, from.y, from.z);
      pos.setXYZ(1, xEdge, lerp(from.y, to.y, draw), lerp(from.z, to.z, draw));
      pos.needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity = draw > 0 ? 0.5 * Math.min(k[i], k[i + 1]) + 0.1 : 0;
    });

    // ---- executed: one sweep of light down the finished document
    this.sweep.position.set(0, lerp(DH / 2 + 0.25, -DH / 2 - 0.25, a[5]), 3 * 0.004 + 0.01 + ex * 3);
    this.sweep.material.opacity = flare * (1 - ex);

    // ---- pose: a three-quarter view at rest, an exploded axonometric when apart
    const still = this.opts.reduced;
    this.root.rotation.set(lerp(-0.1, -0.3, ex) + this.pointer.y * 0.06, lerp(-0.42, -1.0, ex) + this.pointer.x * 0.14, 0);
    this.root.scale.setScalar(lerp(1, 0.48, ex));
    this.root.position.set(lerp(-0.25, -0.45, ex), lerp(0, -0.1, ex) + (still ? 0 : Math.sin(time * 0.7) * 0.05), 0);

    // nothing fully faded is drawn at all
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && m.transparent) o.visible = m.opacity > 0.003;
    });

    // ---- labels when apart
    const lop = clamp01(ex * 1.6 - 0.4);
    this.root.updateMatrixWorld();
    this.layers.forEach((L, i) => this.place(this.labels[i], L.g, -DW / 2, i % 2 ? -DH / 2 - 0.25 : DH / 2 + 0.25, lop * (i === 0 ? 1 : a[i])));
    this.place(this.labels[4], this.blocks[0].g, 1.35, -1.6, lop * k[0]);

    const key = `${started ? idx : -1}|${Math.round(st.t * 50)}`;
    if (key !== this.lastState) {
      this.lastState = key;
      this.opts.onState?.(started ? idx : -1, st.t);
    }
  }

  private v = new THREE.Vector3();
  private place(el: HTMLDivElement, obj: THREE.Object3D, x: number, y: number, op: number) {
    if (op <= 0.003) {
      if (el.style.opacity !== '0') el.style.opacity = '0';
      return;
    }
    this.v.set(x, y, 0);
    obj.localToWorld(this.v);
    this.v.project(this.camera);
    const { w, h } = this.size;
    el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(10px, -50%)`;
    el.style.opacity = op.toFixed(3);
  }
}
