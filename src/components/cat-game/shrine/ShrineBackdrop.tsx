"use client";

import { useEffect, useRef, useState } from "react";
import { pixelRatioFor } from "@/components/home/mystic-scene/camera";
import type { ShrineHandle } from "./createShrine";
import { ABOVE_HEADER, BELOW_BOARD, CELEBRATE_MS, KICK, MIN_FRAME_MS, MOOD_LOOK, moodOf, SCROLL_REST_MS, stepLook, type ShrineMood } from "./mood";

/** Scene time of the still picture shown when the visitor prefers reduced motion. */
const STILL = 2.2;

/**
 * The 3D lucky shrine behind น้องเหมียว 9 ชีวิต. Decorative: it receives two booleans from the game, takes no touches and touches no cat, draw,
 * coin, daily chance, API, database, button or sound. Must be placed inside the game section (`relative`); it stretches from above the page
 * header to below `[data-cat-board]`, and scrolls with the page.
 *
 * The loop runs only while the layer is on screen and the tab is visible, rests while the page scrolls, and is disposed on leaving the page.
 * Reduced motion: a still picture. Without WebGL the page just has no shrine. `data-page-backdrop` makes <body> a stacking context
 * (globals.css), so this -z-10 layer sits above the page background, below all content.
 */
export function ShrineBackdrop({ picking, won }: { picking: boolean; won: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ picking, celebrating: false });
  const refreshRef = useRef<() => void>(() => {});
  const waitingRef = useRef(false);
  const [ready, setReady] = useState(false);

  // celebrate only a win that follows a tap made here (a play already used today stays calm)
  useEffect(() => {
    const state = stateRef.current;
    state.picking = picking;
    if (picking) waitingRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!picking && won && waitingRef.current) {
      waitingRef.current = false;
      state.celebrating = true;
      timer = setTimeout(() => {
        state.celebrating = false;
        refreshRef.current();
      }, CELEBRATE_MS);
    }
    refreshRef.current();
    return () => {
      if (timer) clearTimeout(timer);
      state.celebrating = false;
    };
  }, [picking, won]);

  useEffect(() => {
    const layer = layerRef.current;
    const section = layer?.parentElement;
    if (!layer || !section) return;
    // a fresh canvas per mount: its WebGL context is released on unmount
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    layer.append(canvas);

    let scene: ShrineHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL;
    let look = MOOD_LOOK.idle;
    let mood: ShrineMood = "idle";
    let struckAt = -Infinity;
    let strength = 0;
    let board = { top: 0, height: 0 };
    let onScreen = true;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let lost = false;
    let slow = false;
    let late = 0;
    let frames = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // stretch the layer from above the page header to below the cat board (differences of rects don't depend on scrolling)
    const place = () => {
      const grid = section.querySelector<HTMLElement>("[data-cat-board]");
      const header = section.parentElement?.querySelector<HTMLElement>(":scope > header");
      if (!grid) return false;
      const base = section.getBoundingClientRect().top;
      const top = Math.round((header ? header.getBoundingClientRect().top - base : 0) - ABOVE_HEADER);
      const boardTop = Math.round(grid.getBoundingClientRect().top - base - top);
      board = { top: boardTop, height: grid.offsetHeight };
      const height = boardTop + grid.offsetHeight + BELOW_BOARD;
      layer.style.top = `${top}px`;
      layer.style.height = `${height}px`;
      return true;
    };
    const draw = () => {
      if (!scene || lost) return;
      scene.render({ time, glow: look.glow, wave: look.wave, age: motion.matches ? Infinity : time - struckAt, strength });
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      if (last && gap < MIN_FRAME_MS) return;
      const dt = last ? Math.min(gap / 1000, 0.1) : 0;
      last = now;
      look = stepLook(look, MOOD_LOOK[mood], dt);
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
      const next = moodOf(stateRef.current);
      if (next !== mood) {
        mood = next;
        if (KICK[next]) {
          struckAt = time; // strike the bells
          strength = KICK[next];
        }
      }
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
        look = { wave: 0, glow: MOOD_LOOK[mood].glow };
        draw();
      }
    };
    const resize = () => {
      if (!scene || !place()) return;
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (!w || !h) return;
      scene.setSize(w, h, board, pixelRatioFor(window.devicePixelRatio, w, slow));
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
    // the page above the board can change height (status box, fonts): follow it
    const sizes = new ResizeObserver(resize);
    sizes.observe(section);
    if (section.parentElement) sizes.observe(section.parentElement);
    const visibility = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    visibility.observe(layer);
    place();

    void import("./createShrine")
      .then(({ createShrine }) => {
        if (disposed) return;
        scene = createShrine(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("lucky shrine unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({
      mood,
      running: raf !== 0,
      onScreen,
      scrolling,
      frames,
      wave: +look.wave.toFixed(2),
      glow: +look.glow.toFixed(2),
      sinceStruck: Number.isFinite(struckAt) ? +(time - struckAt).toFixed(2) : null,
      slow,
      ...scene?.stats(),
    });
    (window as unknown as { __shrine?: typeof debug }).__shrine = debug;

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
      data-testid="shrine-backdrop"
      // -inset-x-4: out to the screen edges on phones. Top and height are set from the page's measurements.
      className={"pointer-events-none absolute -inset-x-4 top-0 -z-10 overflow-hidden transition-opacity duration-1000 " + (ready ? "opacity-90" : "opacity-0")}
    />
  );
}
