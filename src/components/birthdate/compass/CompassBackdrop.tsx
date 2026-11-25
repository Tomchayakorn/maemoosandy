"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { CompassHandle } from "./createCompass";
import { anchors, minFrameMs, MOOD_LOOK, ringRadius, stepLook, type CompassMood, type Measured } from "./mood";

/** Angle and time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.2;
/** Layer opacity per mood: faint behind the long reading text. */
const OPACITY: Record<CompassMood, string> = { form: "opacity-70", loading: "opacity-95", result: "opacity-30", error: "opacity-45" };

/**
 * The 3D zodiac halo and ทักษา compass behind the birth-date page. Decorative: its only input is the page's phase; it takes no touches and
 * touches no form field, API, coin, database or sound.
 *
 * The layer scrolls with the page (not fixed), so the loop stops once it is scrolled out of view; it also stops while the tab is hidden and
 * is disposed on leaving the page. Reduced motion: a still picture per mood. Without WebGL the page just has no compass.
 */
export function CompassBackdrop({ mood }: { mood: CompassMood }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const refreshRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    moodRef.current = mood;
    refreshRef.current();
  }, [mood]);

  useEffect(() => {
    const layer = layerRef.current;
    const page = layer?.parentElement;
    if (!layer || !page) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

    let scene: CompassHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let angle = STILL;
    let look = MOOD_LOOK[moodRef.current];
    let measured: Measured = { spacer: null, ball: null };
    let onScreen = true;
    let lost = false;
    let slow = false;
    let frames = 0;
    let lateFrames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // positions inside the page, from layout offsets (unaffected by scrolling and the sections' entrance animations)
    const topOf = (el: HTMLElement) => {
      let y = 0;
      for (let node: HTMLElement | null = el; node && node !== page; node = node.offsetParent as HTMLElement | null) y += node.offsetTop;
      return y;
    };
    const measure = () => {
      const spacer = page.querySelector<HTMLElement>("[data-compass-spacer]");
      const ball = page.querySelector<HTMLElement>('[role="status"] > div');
      // keep the last positions while sections swap, so the rings glide instead of jumping to the defaults
      measured = {
        spacer: spacer ? { top: topOf(spacer), height: spacer.offsetHeight } : measured.spacer,
        ball: ball ? topOf(ball) + ball.offsetHeight * 0.42 : measured.ball,
      };
    };

    const draw = () => {
      if (!scene || lost) return;
      const at = anchors(measured, look.gather);
      scene.render({ angle, time, glow: look.glow, gather: look.gather, haloY: at.halo, compassY: at.compass });
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      const wanted = minFrameMs(moodRef.current);
      if (last && gap < wanted) return;
      const dt = last ? Math.min(gap / 1000, 0.1) : 0;
      last = now;
      look = stepLook(look, MOOD_LOOK[moodRef.current], dt);
      time += dt;
      angle += dt * look.speed;
      draw();
      // a device that keeps missing frames by a wide margin gets 1× resolution
      if (!slow && dt > 0) {
        lateFrames = gap > Math.max(wanted * 2, 50) ? lateFrames + 1 : Math.max(lateFrames - 1, 0);
        if (lateFrames > 30) {
          slow = true;
          resize();
        }
      }
    };
    const sync = () => {
      const run = !!scene && !lost && onScreen && !document.hidden && !motion.matches;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!raf && !document.hidden) {
        if (motion.matches) look = MOOD_LOOK[moodRef.current]; // still picture: jump straight to the mood's look
        draw();
      }
    };
    const resize = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!scene || !w || !h) return;
      scene.setSize(w, h, ringRadius(w), pixelRatioFor(window.devicePixelRatio, w, slow));
      measure();
      draw();
    };
    const refresh = () => {
      measure();
      sync();
    };
    refreshRef.current = refresh;

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
    const sizes = new ResizeObserver(resize);
    sizes.observe(layer);
    // the page swaps whole sections (form → loading → result): measure again when they arrive
    const sections = new MutationObserver(refresh);
    sections.observe(page, { childList: true });
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(layer);

    void import("./createCompass")
      .then(({ createCompass }) => {
        if (disposed) return;
        scene = createCompass(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("birth-date compass unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({
      mood: moodRef.current,
      running: raf !== 0,
      onScreen,
      frames,
      speed: +look.speed.toFixed(2),
      glow: +look.glow.toFixed(2),
      slow,
      ...scene?.stats(),
    });
    (window as unknown as { __compass?: typeof debug }).__compass = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      refreshRef.current = () => {};
      sizes.disconnect();
      sections.disconnect();
      visibility.disconnect();
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
      data-testid="compass-backdrop"
      data-mood={mood}
      // above the room photo (also -z-10, earlier in the page), below all content
      className={
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(100%,52rem)] overflow-hidden transition-opacity duration-1000 " +
        (ready ? OPACITY[mood] : "opacity-0")
      }
    />
  );
}
