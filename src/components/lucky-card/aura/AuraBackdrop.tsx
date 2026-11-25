"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { AuraHandle } from "./createAura";
import { MIN_FRAME_MS } from "./layout";

/** Scene time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 7.5;

/**
 * ดวงดี มีเฮ's backdrop of lucky auras and gold dust: fixed to the screen, so it never moves with scrolling, and the same in every state of the
 * game (it takes no props). Decorative: it takes no touches and touches no card, draw, prize, coin, API, database, button or sound.
 *
 * The loop runs only while the tab is visible and is disposed on leaving the page. Reduced motion: a still picture. Without WebGL the painted
 * sky stays. `data-page-backdrop` makes <body> a stacking context (globals.css), so this -z-10 layer sits above the page background and below
 * all content.
 */
export function AuraBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const layer = layerRef.current;
    const holder = holderRef.current;
    if (!layer || !holder) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    holder.append(canvas);

    let scene: AuraHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = () => {
      if (!scene || lost) return;
      scene.render(time);
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      if (last && gap < MIN_FRAME_MS) return;
      const dt = last ? Math.min(gap / 1000, 0.1) : 0;
      last = now;
      time += dt;
      draw();
      // a device that keeps missing frames by a wide margin gets 1× resolution
      if (!slow && dt > 0) {
        late = gap > MIN_FRAME_MS * 2 ? late + 1 : Math.max(late - 1, 0);
        if (late > 30) {
          slow = true;
          resize();
        }
      }
    };
    const sync = () => {
      const run = !!scene && !lost && !document.hidden && !motion.matches;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!raf && !document.hidden) draw();
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      scene.setSize(w, h, pixelRatioFor(window.devicePixelRatio, w, slow));
      draw();
    };
    const onLost = (e: Event) => {
      e.preventDefault(); // lets the browser restore the context
      lost = true;
      sync();
    };
    const onRestored = () => {
      lost = false;
      resize();
      sync();
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    // the layer is as tall as the largest viewport (lvh), so a phone's collapsing address bar does not resize the canvas mid-scroll
    const sizes = new ResizeObserver(resize);
    sizes.observe(layer);

    void import("./createAura")
      .then(({ createAura }) => {
        if (disposed) return;
        scene = createAura(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("lucky aura unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({ running: raf !== 0, frames, time: +time.toFixed(2), slow, ...scene?.stats() });
    (window as unknown as { __aura?: typeof debug }).__aura = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizes.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      scene?.dispose();
      scene = null;
      canvas.remove();
    };
  }, []);

  return (
    <div ref={layerRef} aria-hidden data-page-backdrop data-testid="aura-backdrop" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden">
      {/* painted sky: violet light high and low, a golden warmth at the foot (also all there is without WebGL) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_45%_at_20%_16%,rgb(88_40_168/0.34),transparent_70%),radial-gradient(ellipse_90%_45%_at_85%_58%,rgb(109_40_217/0.24),transparent_70%),radial-gradient(ellipse_100%_36%_at_50%_100%,rgb(212_175_55/0.14),transparent_72%)]" />
      <div ref={holderRef} className={"absolute inset-0 transition-opacity duration-[1500ms] " + (ready ? "opacity-90" : "opacity-0")} />
    </div>
  );
}
