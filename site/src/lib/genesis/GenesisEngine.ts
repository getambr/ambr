import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { NODES, CENTER, toWorld, sampleOutline, starShape } from "./logo";
import { particleVertex, particleFragment } from "./shaders";

const BRASS = new THREE.Color("#c6a87c");
const BRASS_L = new THREE.Color("#e8d9bb");
const BRASS_D = new THREE.Color("#9a7d52");

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type Quality = "high" | "low";

export class GenesisEngine {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private world = new THREE.Group();
  private formation = new THREE.Group();

  private particleMat!: THREE.ShaderMaterial;
  private points!: THREE.Points;
  private nodes: THREE.Mesh[] = [];
  private lineMat!: THREE.LineBasicMaterial;
  private spark!: THREE.Mesh;

  private timer = new THREE.Timer();
  private raf = 0;
  private progress = 0;
  private scroll = 0;
  private bloomBase = 0.22;
  private pointer = new THREE.Vector2(0, 0);
  private reduced: boolean;
  private dprCap: number;
  private camZ = 9.5;

  constructor(canvas: HTMLCanvasElement, opts: { reduced?: boolean; quality?: Quality } = {}) {
    this.canvas = canvas;
    this.reduced = !!opts.reduced;
    const quality: Quality = opts.quality ?? "high";
    this.dprCap = quality === "low" || this.reduced ? 1 : 2;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    // transparent canvas so the hero composites over the shared page .ambient backdrop
    this.renderer.setClearColor(0x000000, 0);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, this.camZ);

    this.scene.add(this.world);
    this.world.add(this.formation);

    this.buildBackdrop();
    this.buildParticles(quality === "low" ? 1800 : 4200);
    this.buildFormation();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  private buildBackdrop() {
    // soft radial amber glow behind everything
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(198,168,124,0.4)");
    g.addColorStop(0.5, "rgba(154,125,82,0.12)");
    g.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 })
    );
    sprite.scale.set(9, 9, 1);
    sprite.position.set(0, 0, -2.5);
    this.world.add(sprite);
  }

  private buildParticles(count: number) {
    const outlineN = Math.floor(count * 0.5);
    const nodeN = Math.floor(count * 0.16);
    const sparkN = Math.floor(count * 0.05);
    const ambientN = count - outlineN - nodeN - sparkN;

    const pos = new Float32Array(count * 3);
    const home = new Float32Array(count * 3);
    const target = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const role = new Float32Array(count);

    const outline = sampleOutline(outlineN);
    const nodeWorld = NODES.map(([x, y]) => toWorld(x, y, 0.05));
    const centerWorld = toWorld(CENTER[0], CENTER[1], 0.05);

    const setHome = (i: number) => {
      const hx = (Math.random() - 0.5) * 7;
      const hy = (Math.random() - 0.5) * 5.2;
      const hz = (Math.random() - 0.5) * 4 - 0.5;
      pos[i * 3] = home[i * 3] = hx;
      pos[i * 3 + 1] = home[i * 3 + 1] = hy;
      pos[i * 3 + 2] = home[i * 3 + 2] = hz;
    };
    const setTarget = (i: number, v: THREE.Vector3) => {
      target[i * 3] = v.x;
      target[i * 3 + 1] = v.y;
      target[i * 3 + 2] = v.z;
    };

    let i = 0;
    // outline
    for (let k = 0; k < outlineN; k++, i++) {
      setHome(i);
      setTarget(i, outline[k % outline.length]);
      rand[i] = Math.random();
      role[i] = 1;
    }
    // nodes (clustered)
    for (let k = 0; k < nodeN; k++, i++) {
      setHome(i);
      const nw = nodeWorld[k % nodeWorld.length];
      setTarget(
        i,
        new THREE.Vector3(
          nw.x + (Math.random() - 0.5) * 0.18,
          nw.y + (Math.random() - 0.5) * 0.18,
          nw.z + (Math.random() - 0.5) * 0.18
        )
      );
      rand[i] = Math.random();
      role[i] = 1;
    }
    // spark (center cluster)
    for (let k = 0; k < sparkN; k++, i++) {
      setHome(i);
      setTarget(
        i,
        new THREE.Vector3(
          centerWorld.x + (Math.random() - 0.5) * 0.4,
          centerWorld.y + (Math.random() - 0.5) * 0.4,
          centerWorld.z + (Math.random() - 0.5) * 0.2
        )
      );
      rand[i] = Math.random();
      role[i] = 1;
    }
    // ambient (no target — drift then fade)
    for (let k = 0; k < ambientN; k++, i++) {
      setHome(i);
      target[i * 3] = home[i * 3];
      target[i * 3 + 1] = home[i * 3 + 1];
      target[i * 3 + 2] = home[i * 3 + 2];
      rand[i] = Math.random();
      role[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    geo.setAttribute("aRole", new THREE.BufferAttribute(role, 1));

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uSize: { value: 0.72 },
        uPixelRatio: { value: 1 },
        uColorDim: { value: BRASS_D.clone() },
        uColorBright: { value: BRASS_L.clone() },
      },
    });

    this.points = new THREE.Points(geo, this.particleMat);
    this.points.frustumCulled = false;
    this.world.add(this.points);
  }

  private buildFormation() {
    // node spheres
    const nodeGeo = new THREE.SphereGeometry(0.06, 20, 20);
    NODES.forEach(([x, y]) => {
      const m = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: BRASS_L }));
      m.position.copy(toWorld(x, y, 0.06));
      m.scale.setScalar(0);
      this.nodes.push(m);
      this.formation.add(m);
    });

    // lines center -> node
    const center = toWorld(CENTER[0], CENTER[1], 0.04);
    const linePts: number[] = [];
    NODES.forEach(([x, y]) => {
      const n = toWorld(x, y, 0.04);
      linePts.push(center.x, center.y, center.z, n.x, n.y, n.z);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0 });
    this.formation.add(new THREE.LineSegments(lineGeo, this.lineMat));

    // spark (4-point star), centre
    const sparkGeo = new THREE.ExtrudeGeometry(starShape(0.34, 0.12), {
      depth: 0.05,
      bevelEnabled: false,
    });
    sparkGeo.center();
    this.spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: BRASS_L }));
    this.spark.position.copy(center);
    this.spark.scale.setScalar(0);
    this.formation.add(this.spark);
  }

  setProgress(p: number) {
    this.progress = clamp(p, 0, 1);
    if (this.reduced) this.renderFrame(true);
  }

  /** 0..1 progress through the pinned hero — dollies the camera in + ramps bloom. */
  setScroll(s: number) {
    this.scroll = clamp(s, 0, 1);
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particleMat.uniforms.uPixelRatio.value = dpr;
  }

  private renderFrame(force = false) {
    const p = this.progress;
    if (!this.reduced) this.timer.update();
    this.particleMat.uniforms.uProgress.value = p;
    this.particleMat.uniforms.uTime.value = this.reduced ? 0 : this.timer.getElapsed();

    // camera push-in (kept modest so the mark fits the seal with margin),
    // plus a scroll-driven dolly forward so the mark "opens / dives in" as the pinned hero scrolls
    const s = this.reduced ? 0 : this.scroll;
    const targetZ = lerp(9.5, 7.6, p) - s * 3.0;
    this.camera.position.z += (targetZ - this.camera.position.z) * (force ? 1 : 0.1);
    this.camera.lookAt(0, 0, 0);

    // pointer parallax on the whole world group (+ a slow scroll-driven yaw drift)
    if (!this.reduced) {
      this.world.rotation.y += (this.pointer.x * 0.22 + s * 0.5 - this.world.rotation.y) * 0.05;
      this.world.rotation.x += (-this.pointer.y * 0.14 - this.world.rotation.x) * 0.05;
    }

    // scroll ramps the bloom a touch (atmospheric "dive in")
    this.bloom.strength = this.bloomBase + s * 0.25;

    // formation reveal
    const ns = smoothstep(0.45, 0.85, p);
    this.nodes.forEach((n) => n.scale.setScalar(ns));
    this.lineMat.opacity = smoothstep(0.5, 0.85, p) * 0.7;
    const ss = smoothstep(0.72, 1.0, p);
    this.spark.scale.setScalar(ss);
    if (!this.reduced) this.spark.rotation.z += 0.01;

    this.composer.render();
  }

  start() {
    if (this.reduced) {
      this.renderFrame(true);
      return;
    }
    const loop = () => {
      this.renderFrame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      const any = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      any.geometry?.dispose?.();
      const m = any.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
