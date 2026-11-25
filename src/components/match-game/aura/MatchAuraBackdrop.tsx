"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { MatchAuraHandle } from "./createMatchAura";
import { MIN_FRAME_MS, PAD_X, PAD_Y, SCROLL_REST_MS } from "./layout";

/** The time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 4;

/**
 * The 3D light behind the จับคู่ภาพเหมือน board. Place it inside the board's own box (`relative`): it is centred on that box with CSS, so it
 * scrolls with the board and always stays behind it. Decorative: it takes no props and no touches, and knows nothing about the game.
 *
 * The loop runs only while the layer is on screen and the tab is visible, rests while the page scrolls, and is disposed on leaving the page.
 * Reduced motion: one still picture. Without WebGL the page just has no backdrop. `data-page-backdrop` makes <body> a stacking context
 * (globals.css), so this -z-10 layer sits above the page background, below all content.
 */
export function MatchAuraBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

    let scene: MatchAuraHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = () => {
      if (!scene || lost) return;
      scene.render(motion.matches ? STILL : time);
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
      const run = !!scene && !lost && onScreen && !scrolling && !document.hidden && !motion.matches;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (motion.matches && !document.hidden) draw();
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      scene.setSize(w, h, pixelRatioFor(window.devicePixelRatio, window.innerWidth, slow));
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

    void import("./createMatchAura")
      .then(({ createMatchAura }) => {
        if (disposed) return;
        scene = createMatchAura(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("matching game backdrop unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({ running: raf !== 0, onScreen, scrolling, frames, slow, ...scene?.stats() });
    (window as unknown as { __matchAura?: typeof debug }).__matchAura = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(scrollTimer);
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
      data-testid="match-backdrop"
      // centred on the board; never wider than the screen, so it cannot cause sideways scrolling
      className={
        "pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden transition-opacity duration-[1200ms] motion-reduce:transition-none " +
        (ready ? "opacity-100" : "opacity-0")
      }
      style={{ width: `min(calc(100% + ${PAD_X * 2}px), 100vw)`, height: `calc(100% + ${PAD_Y * 2}px)` }}
    />
  );
}
