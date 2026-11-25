"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { AltarHandle } from "./createAltar";
import { CELEBRATE_MS, LAYER_ABOVE, LAYER_BELOW, MIN_FRAME_MS, MOOD_LOOK, moodOf, SCROLL_REST_MS, stepLook } from "./mood";

/** Motion angle and time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.6;

/**
 * The 3D golden altar behind the lucky wheel. Decorative: it receives three booleans from the page, takes no touches and touches no draw,
 * coin, spin right, API, database, wheel or sound. Must be placed inside the wheel's box (`relative`); it reaches above and below it.
 *
 * The loop runs only while the layer is on screen and the tab is visible, rests while the page is scrolling or the result window covers it,
 * and is disposed on leaving the page. Reduced motion: a still picture. Without WebGL the page just has no altar.
 *
 * `data-page-backdrop` makes <body> a stacking context (globals.css), so this -z-10 layer sits above the page background, below all content.
 */
export function AltarBackdrop({ spinning, resultOpen, won }: { spinning: boolean; resultOpen: boolean; won: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ spinning, resultOpen, celebrating: false });
  const refreshRef = useRef<() => void>(() => {});
  const wonRef = useRef(false);
  const [ready, setReady] = useState(false);

  // celebrate once the result window of a winning spin is closed (while it is open it hides the page)
  useEffect(() => {
    stateRef.current = { ...stateRef.current, spinning, resultOpen };
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (resultOpen) wonRef.current = won;
    else if (wonRef.current && !spinning) {
      wonRef.current = false;
      stateRef.current.celebrating = true;
      timer = setTimeout(() => {
        stateRef.current.celebrating = false;
        refreshRef.current();
      }, CELEBRATE_MS);
    }
    if (spinning) wonRef.current = false;
    refreshRef.current();
    return () => {
      if (timer) clearTimeout(timer);
      stateRef.current.celebrating = false;
    };
  }, [spinning, resultOpen, won]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

    let scene: AltarHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let angle = STILL;
    let look = MOOD_LOOK.idle;
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mood = () => moodOf(stateRef.current);

    const draw = () => {
      if (!scene || lost) return;
      scene.render({ angle, time, glow: look.glow, burst: look.burst });
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      if (last && gap < MIN_FRAME_MS) return;
      const dt = last ? Math.min(gap / 1000, 0.1) : 0;
      last = now;
      look = stepLook(look, MOOD_LOOK[mood()], dt);
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
      const run = !!scene && !lost && onScreen && !scrolling && !document.hidden && !motion.matches && mood() !== "covered";
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      // reduced motion: one still picture that shows the mood's light
      if (motion.matches && !document.hidden) {
        look = { ...MOOD_LOOK[mood()], burst: 0 };
        draw();
      }
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      const box = h - LAYER_ABOVE - LAYER_BELOW; // the wheel's own square
      scene.setSize(w, h, LAYER_ABOVE + box / 2, Math.min(w, box) / 2, pixelRatioFor(window.devicePixelRatio, w, slow));
      draw();
    };
    const onScroll = () => {
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

    void import("./createAltar")
      .then(({ createAltar }) => {
        if (disposed) return;
        scene = createAltar(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("wheel altar unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({
      mood: mood(),
      running: raf !== 0,
      onScreen,
      scrolling,
      frames,
      speed: +look.speed.toFixed(2),
      glow: +look.glow.toFixed(2),
      burst: +look.burst.toFixed(2),
      slow,
      ...scene?.stats(),
    });
    (window as unknown as { __altar?: typeof debug }).__altar = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(scrollTimer);
      refreshRef.current = () => {};
      sizes.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("scroll", onScroll);
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
      data-testid="altar-backdrop"
      className={
        "pointer-events-none absolute inset-x-0 -z-10 overflow-hidden transition-opacity duration-1000 " +
        // wide screens: the box ends before the screen does, so let its sides fade out instead of showing a hard edge
        "sm:[mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)] " +
        (ready ? "opacity-80" : "opacity-0")
      }
      style={{ top: -LAYER_ABOVE, bottom: -LAYER_BELOW }}
    />
  );
}
