"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { TowerHandle } from "./createTower";
import { GLOW_PAD, MIN_FRAME_MS, SCROLL_REST_MS, stepLook, targetLook } from "./mood";

/** Motion angle and time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.5;

/**
 * The 3D power rings behind วงล้อไต่ชั้น. Place it inside the wheel's own box (`relative`): it is centred on that box with CSS, so it scrolls
 * with the wheel and can never drift off its centre. Decorative: it receives only `spinning` and `level`, takes no touches and touches no
 * spin, climb, power, coin, reward, API, database, wheel, button or sound.
 *
 * The loop runs only while the layer is on screen and the tab is visible, rests while the page scrolls, and is disposed on leaving the page.
 * Reduced motion: a still picture that still shows the cleared levels. Without WebGL the page just has no rings. `data-page-backdrop` makes
 * <body> a stacking context (globals.css), so this -z-10 layer sits above the page background, below all content.
 */
export function TowerBackdrop({ spinning, level }: { spinning: boolean; level: number }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ spinning, level });
  const refreshRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    stateRef.current = { spinning, level };
    refreshRef.current();
  }, [spinning, level]);

  useEffect(() => {
    const layer = layerRef.current;
    const box = layer?.parentElement;
    if (!layer || !box) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

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
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const target = () => targetLook(stateRef.current.spinning, stateRef.current.level);

    const wheelSize = () => box.querySelector<HTMLElement>("[data-testid=climb-wheel]")?.offsetWidth ?? Math.min(box.clientWidth, 336);
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
      const run = !!scene && !lost && onScreen && !scrolling && !document.hidden && !motion.matches;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      // reduced motion: a still picture that shows the cleared levels at once
      if (motion.matches && !document.hidden) {
        look = { ...target(), boost: 0 };
        draw();
      }
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      scene.setSize(w, h, wheelSize(), pixelRatioFor(window.devicePixelRatio, w, slow));
      draw();
    };
    const onScroll = () => {
      if (motion.matches) return; // the still picture needs no redraw
      scrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrolling = false;
        sync();
      }, SCROLL_REST_MS);
      sync();
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
    window.addEventListener("scroll", onScroll, { passive: true });
    motion.addEventListener("change", sync);
    const sizes = new ResizeObserver(resize);
    sizes.observe(layer);
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(layer);

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
      onScreen,
      scrolling,
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
      clearTimeout(scrollTimer);
      refreshRef.current = () => {};
      sizes.disconnect();
      visibility.disconnect();
      window.removeEventListener("scroll", onScroll);
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
    <div
      ref={layerRef}
      aria-hidden
      data-page-backdrop
      data-testid="tower-backdrop"
      // centred on the wheel's box; never wider than the screen, so it cannot cause sideways scrolling
      className={
        "pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden transition-opacity duration-[1200ms] " +
        (ready ? "opacity-100" : "opacity-0")
      }
      style={{ width: `min(calc(100% + ${GLOW_PAD * 2}px), 100vw)`, height: `calc(100% + ${GLOW_PAD * 2}px)` }}
    />
  );
}
