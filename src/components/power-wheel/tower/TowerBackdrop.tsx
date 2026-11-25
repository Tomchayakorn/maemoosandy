"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { TowerHandle } from "./createTower";
import { MIN_FRAME_MS, stepLook, targetLook } from "./mood";

/** Motion angle and time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.5;

/**
 * The 3D power tower behind วงล้อไต่ชั้น: fixed to the screen, so it never moves with scrolling. Decorative: it receives only `spinning` and
 * `level`, takes no touches and touches no spin, climb, power, coin, reward, API, database, wheel, button or sound.
 *
 * The loop runs only while the tab is visible and is disposed on leaving the page. Reduced motion: a still picture that still shows the cleared
 * levels. Without WebGL the painted backdrop stays. `data-page-backdrop` makes <body> a stacking context (globals.css), so this -z-10 layer
 * sits above the page background and below all content.
 */
export function TowerBackdrop({ spinning, level }: { spinning: boolean; level: number }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ spinning, level });
  const refreshRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    stateRef.current = { spinning, level };
    refreshRef.current();
  }, [spinning, level]);

  useEffect(() => {
    const layer = layerRef.current;
    const holder = holderRef.current;
    if (!layer || !holder) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    holder.append(canvas);

    let scene: TowerHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let angle = STILL;
    let look = targetLook(stateRef.current.spinning, stateRef.current.level);
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = () => targetLook(stateRef.current.spinning, stateRef.current.level);

    // where the wheel rests when the page is at the top (layout offsets ignore the scroll position)
    const wheelAt = () => {
      const wheel = document.querySelector<HTMLElement>("[data-testid=climb-wheel]");
      if (!wheel) return { centre: layer.clientHeight * 0.55, radius: Math.min(layer.clientWidth, 448) * 0.42 };
      let top = 0;
      for (let node: HTMLElement | null = wheel; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
      return { centre: Math.round(top + wheel.offsetHeight / 2), radius: Math.round(wheel.offsetWidth / 2) };
    };
    const draw = () => {
      if (!scene || lost) return;
      scene.render({ angle, time, energy: look.energy, boost: look.boost });
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      if (last && gap < MIN_FRAME_MS) return;
      const dt = last ? Math.min(gap / 1000, 0.1) : 0;
      last = now;
      look = stepLook(look, target(), dt);
      time += dt;
      angle += dt * look.speed;
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
      if (!raf && !document.hidden) {
        if (motion.matches) look = { ...target(), boost: 0 }; // still picture: show the cleared levels at once
        draw();
      }
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      scene.setSize(w, h, wheelAt(), pixelRatioFor(window.devicePixelRatio, w, slow));
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
    refreshRef.current = sync;

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    // the layer is as tall as the largest viewport (lvh), so a phone's collapsing address bar does not resize the canvas mid-scroll
    const sizes = new ResizeObserver(resize);
    sizes.observe(layer);

    void import("./createTower")
      .then(({ createTower }) => {
        if (disposed) return;
        scene = createTower(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("power tower unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({
      running: raf !== 0,
      frames,
      spinning: stateRef.current.spinning,
      level: stateRef.current.level,
      energy: +look.energy.toFixed(3),
      boost: +look.boost.toFixed(2),
      speed: +look.speed.toFixed(2),
      slow,
      ...scene?.stats(),
    });
    (window as unknown as { __tower?: typeof debug }).__tower = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      refreshRef.current = () => {};
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
    <div ref={layerRef} aria-hidden data-page-backdrop data-testid="tower-backdrop" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden">
      {/* painted backdrop: a violet shaft of light with a golden floor (also all there is without WebGL) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_55%,rgb(76_33_146/0.3),transparent_72%),radial-gradient(ellipse_90%_28%_at_50%_102%,rgb(212_175_55/0.13),transparent_70%)]" />
      <div ref={holderRef} className={"absolute inset-0 transition-opacity duration-[1200ms] " + (ready ? "opacity-85" : "opacity-0")} />
    </div>
  );
}
