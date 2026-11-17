"use client";

import confetti from "canvas-confetti";

const GOLD = ["#d4af37", "#f3d98b", "#f6efdc", "#a8841f", "#fff4cc"];

/** Big celebratory burst of gold dust and stars from both sides. */
export function goldCelebration() {
  const base = {
    colors: GOLD,
    shapes: ["star", "circle"] as confetti.Shape[],
    disableForReducedMotion: true,
    zIndex: 60,
  };
  confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.15, y: 0.75 }, angle: 60 });
  confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.85, y: 0.75 }, angle: 120 });
  setTimeout(() => confetti({ ...base, particleCount: 60, spread: 120, scalar: 0.8, origin: { x: 0.5, y: 0.45 } }), 250);
}

/** Small sparkle from an element's centre (e.g. a card being flipped). */
export function goldSparkleAt(el: Element | null) {
  if (!el || typeof window === "undefined") return;
  const r = el.getBoundingClientRect();
  confetti({
    colors: GOLD,
    shapes: ["star", "circle"] as confetti.Shape[],
    particleCount: 28,
    spread: 360,
    startVelocity: 14,
    gravity: 0.6,
    scalar: 0.7,
    ticks: 90,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
    disableForReducedMotion: true,
    zIndex: 60,
  });
}
