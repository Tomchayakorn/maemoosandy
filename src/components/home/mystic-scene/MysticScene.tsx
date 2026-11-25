"use client";

import { useEffect, useRef, useState } from "react";
import { LOGO_CENTER_FALLBACK_PX, lookAtHeight, orbitPose, pixelRatioFor, tallness } from "./camera";
import type { MysticSceneHandle } from "./createScene";

/** About 30 drawn frames a second: plenty for slow background motion, and half the work on the phone. */
const MIN_FRAME_MS = 30;
/** If frames average slower than this over a sample, the render resolution drops to 1× for the rest of the visit. */
const SLOW_FRAME_MS = 50;
const SAMPLE_FRAMES = 60;
/** Scene time of the still picture shown when the visitor prefers reduced motion. */
const STILL_TIME = 2.4;

/**
 * The 3D shrine as the home page's backdrop: fixed behind everything and never taking a touch (scrolling, buttons and cards work as if it
 * were not there), dimmed and veiled so the text in front stays easy to read. Purely decorative: no API, wallet, database or sound.
 * three.js is downloaded after the page is up; without WebGL the painted gradient stays.
 * The loop runs only while the tab is visible (and ends when the visitor leaves the page); with reduced motion it draws a still picture.
 *
 * `data-home-backdrop` makes <body> a stacking context (globals.css), so this layer sits above the page background and below all content.
 */
export function MysticScene() {
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

    let scene: MysticSceneHandle | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let time = STILL_TIME;
    let lost = false;
    let slow = false;
    let frames = 0;
    let sampleStart = 0;
    let sampleCount = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let logoNdc = 0.45;

    // where the hero logo's centre is when the page is at the top (offsets ignore its floating animation and the scroll position)
    const measureLogo = () => {
      let el = document.querySelector<HTMLElement>("[data-hero-emblem]");
      let centre = el ? el.offsetHeight / 2 : LOGO_CENTER_FALLBACK_PX;
      for (; el; el = el.offsetParent as HTMLElement | null) centre += el.offsetTop;
      logoNdc = 1 - (2 * centre) / Math.max(layer.clientHeight, 1);
    };

    const draw = () => {
      if (!scene || lost) return;
      const aspect = layer.clientWidth / Math.max(layer.clientHeight, 1);
      // on tall (phone) screens the ball and its rings rise to hang behind the logo
      scene.render(time, orbitPose(time, aspect), lookAtHeight(aspect), { ndcY: logoNdc, amount: tallness(aspect) });
      frames++;
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (last && now - last < MIN_FRAME_MS) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      time += dt;
      draw();
      if (!slow) {
        if (!sampleCount) sampleStart = now;
        if (++sampleCount > SAMPLE_FRAMES) {
          if ((now - sampleStart) / SAMPLE_FRAMES > SLOW_FRAME_MS) {
            slow = true;
            resize();
          }
          sampleCount = 0;
        }
      }
    };
    const sync = () => {
      const run = !!scene && !lost && !document.hidden && !motion.matches;
      if (run && !raf) {
        last = 0;
        sampleCount = 0;
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
      measureLogo();
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
    // the logo moves down when something above it arrives late (the toolbar streams in), which changes the page height
    const page = new ResizeObserver(() => {
      measureLogo();
      if (!raf) draw();
    });
    page.observe(document.body);

    void import("./createScene")
      .then(({ createMysticScene }) => {
        if (disposed) return;
        scene = createMysticScene(canvas);
        resize();
        sync();
        setReady(true);
      })
      .catch((error) => {
        if (disposed) return;
        console.warn("mystic scene unavailable", error);
        canvas.remove();
      });

    // for checking in the browser console
    const debug = () => ({ running: raf !== 0, frames, time: +time.toFixed(2), slow, logoNdc: +logoNdc.toFixed(3), ...scene?.stats() });
    (window as unknown as { __mysticScene?: typeof debug }).__mysticScene = debug;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizes.disconnect();
      page.disconnect();
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
      data-home-backdrop
      data-state={ready ? "ready" : "still"}
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden"
    >
      {/* soft purple glow: all there is without WebGL */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_58%,rgb(59_22_117/0.55)_0%,rgb(26_10_54/0.35)_50%,transparent_80%)]" />
      <div ref={holderRef} className={"absolute inset-0 transition-opacity duration-[1500ms] " + (ready ? "opacity-50" : "opacity-0")} />
      {/* veils: darker behind the text column, where the title is read and at the footer */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_min(26rem,85%)_38%_at_50%_52%,rgb(11_10_18/0.5)_0%,rgb(11_10_18/0.3)_55%,transparent_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_10_18/0.6)_0%,rgb(11_10_18/0.35)_45%,rgb(11_10_18/0.12)_70%,rgb(11_10_18/0.5)_100%)]" />
    </div>
  );
}
