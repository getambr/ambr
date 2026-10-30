import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

// The Ambr mark in its native 0..100 viewBox (Y-down, SVG space).
export const DROPLET_D =
  "M51 12 C39 20 31 38 29 52 C27 71 39 86 50 86 C62 86 72 71 71 53 C70 38 64 21 51 12 Z";
export const NODES: Array<[number, number]> = [
  [40, 39],
  [62, 45],
  [56, 65],
];
export const CENTER: [number, number] = [50, 52];

const SCALE = 0.06;

/** Map logo space (0..100, Y-down, centred ~50,49) into world units (Y-up). */
export function toWorld(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3((x - 50) * SCALE, -(y - 49) * SCALE, z);
}

/** Points spaced evenly along the droplet outline, in world space. */
export function sampleOutline(count: number): THREE.Vector3[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${DROPLET_D}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const shape = data.paths[0].toShapes(true)[0];
  const pts = shape.getSpacedPoints(count);
  return pts.map((p) => toWorld(p.x, p.y, (Math.random() - 0.5) * 0.14));
}

/** A 4-point concave star (the brand spark), centred at the origin, in world units. */
export function starShape(outer = 0.34, inner = 0.12): THREE.Shape {
  const s = new THREE.Shape();
  const tips = 4;
  for (let i = 0; i < tips * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / tips) * i - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
