"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Particles({ count = 2600 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const accent = new THREE.Color("#bc3fff");
    const mist = new THREE.Color("#d4a3ff");
    for (let i = 0; i < count; i++) {
      // Distribute in a soft disc so density reads as depth, not noise.
      const r = Math.pow(Math.random(), 0.7) * 9;
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = Math.sin(theta) * r - 2;
      const c = accent.clone().lerp(mist, Math.random());
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.035;
    // gentle mouse parallax
    const { x, y } = state.pointer;
    ref.current.rotation.x = THREE.MathUtils.lerp(ref.current.rotation.x, y * 0.18, 0.04);
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, x * 0.6, 0.04);
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Glow() {
  // Soft purple halo behind the particles — matches the THC logo.
  return (
    <mesh position={[0, 1.5, -6]}>
      <circleGeometry args={[6, 64]} />
      <meshBasicMaterial color="#bc3fff" transparent opacity={0.07} />
    </mesh>
  );
}

export default function Scene() {
  return (
    <div className="scene-bg">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.75]}>
        <Glow />
        <Particles />
      </Canvas>
    </div>
  );
}
