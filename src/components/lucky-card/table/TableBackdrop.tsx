"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { TableHandle } from "./createTable";
import { CELEBRATE_MS, LAYER_HEIGHT, MIN_FRAME_MS, MOOD_LOOK, SCROLL_REST_MS, stepLook, type TableMood } from "./mood";

/** Motion angle and time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.4;

/**
 * The 3D lucky table behind ดวงดี มีเฮ. Decorative: its only input is the screen's mood; it takes no touches and touches no card, draw, prize,
 * coin, API, database, button or sound. Must be placed inside the game section (`relative`): it centres itself on `[data-table-anchor]`
 * (the card board, or the result card).
 *
 * The loop runs only while the layer is on screen and the tab is visible, rests while the page scrolls, and is disposed on leaving the page.
 * Reduced motion: a still picture. Without WebGL the page just has no table.
 *
 * `data-page-backdrop` makes <body> a stacking context (globals.css), so this -z-10 layer sits above the page background, below all content.
 */
export function TableBackdrop({ mood }: { mood: TableMood }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const celebratingRef = useRef(false);
  const refreshRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    moodRef.current = mood;
    celebratingRef.current = mood === "special";
    refreshRef.current();
    if (mood !== "special") return;
    const timer = setTimeout(() => {
      celebratingRef.current = false;
      refreshRef.current();
    }, CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [mood]);

  useEffect(() => {
    const layer = layerRef.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

    let scene: TableHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let angle = STILL;
    let look = MOOD_LOOK[moodRef.current];
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // the warm light stays for a special result; the sparkles only for the first few seconds
    const target = () => {
      const base = MOOD_LOOK[moodRef.current];
      return celebratingRef.current ? base : { ...base, burst: 0 };
    };

    // keep the layer centred on the board or the result card (layout offsets: unaffected by scrolling and entrance animations)
    const place = () => {
      const anchor = section.querySelector<HTMLElement>("[data-table-anchor]");
      if (!anchor) return; // between two screens: stay where it was
      let top = anchor.offsetHeight / 2 - LAYER_HEIGHT / 2;
      for (let node: HTMLElement | null = anchor; node && node !== section; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
      layer.style.transform = `translateY(${Math.round(top)}px)`;
    };
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
      // reduced motion: one still picture that shows the mood's light
      if (motion.matches && !document.hidden) {
        look = { ...MOOD_LOOK[moodRef.current], burst: 0 };
        draw();
      }
    };
    const refresh = () => {
      place();
      sync();
    };
    const resize = () => {
      const w = layer.clientWidth;
      if (!scene || !w) return;
      scene.setSize(w, LAYER_HEIGHT, pixelRatioFor(window.devicePixelRatio, w, slow));
      place();
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
    refreshRef.current = refresh;

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("scroll", onScroll, { passive: true });
    motion.addEventListener("change", sync);
    const sizes = new ResizeObserver(resize);
    sizes.observe(layer);
    // the board and the result card come and go: follow them
    const content = new ResizeObserver(place);
    content.observe(section);
    const swaps = new MutationObserver(refresh);
    swaps.observe(section, { childList: true });
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(layer);
    place();

    void import("./createTable")
      .then(({ createTable }) => {
        if (disposed) return;
        scene = createTable(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("lucky table unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({
      mood: moodRef.current,
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
    (window as unknown as { __table?: typeof debug }).__table = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(scrollTimer);
      refreshRef.current = () => {};
      sizes.disconnect();
      content.disconnect();
      swaps.disconnect();
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
      data-testid="table-backdrop"
      data-mood={mood}
      className={
        // -inset-x-4: out to the screen edges on phones; wider screens fade the sides instead of showing an edge
        "pointer-events-none absolute -inset-x-4 top-0 -z-10 overflow-hidden transition-[opacity,transform] duration-700 " +
        "sm:[mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)] " +
        (ready ? "opacity-80" : "opacity-0")
      }
      style={{ height: LAYER_HEIGHT }}
    />
  );
}
