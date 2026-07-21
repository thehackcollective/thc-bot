"use client";

// Minimal pixelated backdrop for the login panel, drawn on a 2D canvas (crisp pixels,
// paints a visible first frame immediately, cheap). A dark grid breathes with a slow
// diagonal wave at rest; cells near the cursor light up in brand purple, quantised per
// cell so the glow stays blocky. Purely cosmetic.

import { useEffect, useRef } from "react";

const CELL = 24; // px per pixel-cell (before DPR)
const GAP = 2; // px gap between cells
const ACCENT = [168, 85, 247]; // brand purple

export default function LoginScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Locals that stay non-null inside the nested closures below.
    const el = canvas;
    const ctx = context;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Mouse in CSS pixels; starts off-canvas so nothing is lit until the user moves in.
    const mouse = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let W = 0;
    let H = 0;

    function resize() {
      const r = el.getBoundingClientRect();
      W = r.width;
      H = r.height;
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t: number) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0d0a16";
      ctx.fillRect(0, 0, W, H);

      const cols = Math.ceil(W / CELL);
      const rows = Math.ceil(H / CELL);
      const radius = 150; // px reach of the cursor glow
      const time = t / 1000;

      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const px = cx * CELL;
          const py = cy * CELL;

          // Idle: a slow diagonal wave keeps the grid faintly alive and visible at rest.
          const wave = 0.5 + 0.5 * Math.sin(time * 0.9 + (cx + cy) * 0.45);
          let intensity = 0.05 + 0.06 * wave;

          // Cursor glow, measured to the cell centre so the falloff is blocky.
          if (mouse.active) {
            const dx = px + CELL / 2 - mouse.x;
            const dy = py + CELL / 2 - mouse.y;
            const d = Math.hypot(dx, dy);
            if (d < radius) {
              const g = 1 - d / radius;
              intensity += g * g * 0.95;
            }
          }

          intensity = Math.min(1, intensity);
          if (intensity <= 0.02) continue;
          ctx.fillStyle = `rgba(${ACCENT[0]}, ${ACCENT[1]}, ${ACCENT[2]}, ${intensity})`;
          ctx.fillRect(px, py, CELL - GAP, CELL - GAP);
        }
      }
      raf = requestAnimationFrame(draw);
    }

    function onMove(e: MouseEvent) {
      const r = el.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
    }
    function onLeave() {
      mouse.active = false;
    }

    resize();
    draw(0); // paint one frame immediately (visible even if rAF is throttled)
    window.addEventListener("resize", resize);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
