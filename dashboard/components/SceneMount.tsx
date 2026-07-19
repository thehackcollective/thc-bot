"use client";

import dynamic from "next/dynamic";

// r3f Canvas can't render on the server — load client-only from a client component.
const Scene = dynamic(() => import("./Scene"), { ssr: false });

export default function SceneMount() {
  return <Scene />;
}
