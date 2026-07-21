"use client";

// Decorative WebGL backdrop for the login page's left panel.
// A slowly-morphing icosahedron in the brand purple, wrapped in a drifting field of
// sparkles, with a gentle parallax that follows the cursor. Purely cosmetic — it renders
// nothing interactive and carries no app state.

import { useRef } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import type { Group, Mesh } from "three";

const ACCENT = "#a855f7"; // brand purple
const ACCENT_DEEP = "#6d28d9";

function Blob() {
  const mesh = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (mesh.current) mesh.current.rotation.y += dt * 0.15;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.6} floatIntensity={0.8}>
      <Icosahedron ref={mesh} args={[1.35, 12]}>
        <MeshDistortMaterial
          color={ACCENT}
          emissive={ACCENT_DEEP}
          emissiveIntensity={0.35}
          roughness={0.25}
          metalness={0.4}
          distort={0.4}
          speed={1.8}
        />
      </Icosahedron>
    </Float>
  );
}

// Ease the camera toward the pointer so the scene has subtle depth on mouse move.
function Parallax() {
  useFrame((state: RootState) => {
    const { camera, pointer } = state;
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function LoginScene() {
  const group = useRef<Group>(null);
  return (
    <Canvas camera={{ position: [0, 0, 4.2], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 4, 4]} intensity={40} color={ACCENT} />
      <pointLight position={[-4, -2, 2]} intensity={20} color="#4c1d95" />
      <group ref={group}>
        <Blob />
        <Sparkles count={90} scale={7} size={2.5} speed={0.35} color={ACCENT} opacity={0.7} />
      </group>
      <Parallax />
    </Canvas>
  );
}
