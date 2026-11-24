"use client";

import { SfxBase } from "./sfxBase";
import type { RewardTier } from "@/lib/mystic/sfx-tier";

/**
 * Synthesised sound effects for เปิดหีบมนตรา (Web Audio only — no audio files).
 *
 *   open()        — the moment the player taps a chest: a wooden latch thunk, a short creak and three soft magical sparkles
 *   reward(tier)  — the moment a prize shows: gold coin clinks and a bright chime arpeggio; the bigger the tier the grander it gets
 *
 * The synthesis toolkit, mute rule (header music toggle), ducking and level limiting live in SfxBase.
 */
class ChestSfx extends SfxBase {
  constructor() {
    super("chest-sfx");
  }

  /** Tap on a chest: latch + creak + sparkles (~0.8 s). */
  open() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.01;
    // latch: a short noisy click and a low wooden thunk
    this.burst(ctx, out, t, 0.02, { f: 2400, gain: 0.3 });
    this.tone(ctx, out, 190, t, 0.07, { gain: 0.34, endFreq: 95, type: "triangle" });
    // creak: a slow rising saw through a low-pass, kept quiet
    this.creak(ctx, out, t + 0.05);
    // magic sparkle: three bright notes, staggered and panned
    [1568, 2093, 2637].forEach((f, i) => this.bell(ctx, out, f, t + 0.2 + i * 0.1, 0.4, 0.085, i === 1 ? 0.45 : i === 0 ? -0.35 : 0.1));
    this.end(0.85);
  }

  /** A prize shows (a safe chest, or coins taken): coins + chimes, grander for a bigger tier. */
  reward(tier: RewardTier) {
    this.coinReward(tier);
  }

  /** For debugging in the console: window.__chestSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", enabled: this.enabled(), sources: this.sources.length };
  }
}

export const chestSfx = new ChestSfx();

if (typeof window !== "undefined") (window as unknown as { __chestSfx?: ChestSfx }).__chestSfx = chestSfx;
