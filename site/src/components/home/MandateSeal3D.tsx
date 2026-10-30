'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh, Group } from 'three';

function Seal() {
  const group = useRef<Group>(null);
  const inner = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.16;
      group.current.rotation.x += delta * 0.05;
    }
    if (inner.current) {
      inner.current.rotation.y -= delta * 0.28;
      inner.current.rotation.z += delta * 0.12;
    }
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[2.3, 1]} />
        <meshBasicMaterial wireframe color="#c6a87c" transparent opacity={0.6} />
      </mesh>
      <mesh ref={inner}>
        <torusGeometry args={[1.35, 0.012, 8, 90]} />
        <meshBasicMaterial color="#e8d9bb" transparent opacity={0.65} />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.7, 0.01, 8, 90]} />
        <meshBasicMaterial color="#9a7d52" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/** Lazy, desktop-only WebGL "mandate seal" — a slowly rotating brass wireframe. */
export default function MandateSeal3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      dpr={[1, 1.5]}
      style={{ width: '100%', height: '100%' }}
    >
      <Seal />
    </Canvas>
  );
}
