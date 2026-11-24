"use client";

import { SfxBase } from "./sfxBase";
import type { RewardTier } from "@/lib/mystic/sfx-tier";
import { pitchFor } from "@/lib/power-wheel/sfx-pitch";

/**
 * Synthesised sound effects for วงล้อไต่ชั้น (Web Audio only — no audio files).
 *
 *   start()          — a round begins (bet confirmed): a coin dropped on velvet + a short rising two-note chime (~0.45 s)
 *   spin(secs, pegs, level) — wheel ticks that follow the wheel's real slowing down (fast → slow, pitch easing lower) over a soft whoosh;
 *                      the whole tick pitch sits a little higher on a higher level (pitchFor).
 *                      All ticks are scheduled up-front on the audio clock, so no JS timers run during the animation (no jank).
 *   climb(level)     — a level was cleared: coin clink + a bright chime whose pitch rises with the level (up to an octave)
 *   reward(tier, level) — coins taken / paid out automatically: gold coin clinks + chimes, grander for a bigger prize (same tiers as เปิดหีบมนตรา),
 *                      pitched a little higher for a higher level
 *   fail()           — fell on a danger slice: a low thud, two sinking minor notes and a dull crumble — clearly unlike any win
 *
 * Mute rule (header music toggle), music ducking, level limiting and cleanup live in SfxBase. Every call is a no-op when muted.
 */
class PowerSfx extends SfxBase {
  constructor() {
    super("power-sfx");
  }

  /** Round started (the bet was taken). */
  start() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.01;
    // coin dropped on velvet: two inharmonic clinks and a soft thunk
    this.tone(ctx, out, 2200, t, 0.14, { gain: 0.13, pan: -0.2 });
    this.tone(ctx, out, 2200 * 2.76, t, 0.09, { gain: 0.05, pan: -0.2 });
    this.tone(ctx, out, 1750, t + 0.07, 0.16, { gain: 0.09, pan: 0.2 });
    this.tone(ctx, out, 150, t, 0.1, { type: "triangle", gain: 0.2, endFreq: 90 });
    // rising "ready" chime
    this.bell(ctx, out, 784, t + 0.16, 0.3, 0.09, -0.1);
    this.bell(ctx, out, 1046.5, t + 0.26, 0.4, 0.1, 0.1);
    this.end(0.7);
  }

  /** The wheel spins for `seconds` and passes about `pegs` pegs; the ticks slow down like the wheel does. */
  spin(seconds: number, pegs: number, level = 0) {
    this.stop(); // cut a previous effect (new spin / new round)
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const T = Math.max(0.3, seconds);
    const n = Math.min(40, Math.max(3, Math.round(pegs)));
    const t0 = ctx.currentTime + 0.02;
    const pitch = pitchFor(level); // a little higher on a higher level
    for (let k = 1; k <= n; k++) {
      const p = k / n;
      const at = t0 + T * (1 - Math.pow(1 - p, 1 / 3)); // wheel position follows an ease-out curve: pegs come fast first, then slower
      const f = (1500 - 520 * p) * pitch; // pitch eases lower as the wheel slows (and sits a bit higher on higher levels)
      const gain = 0.07 + 0.05 * p; // the last ticks are a little firmer
      this.tone(ctx, out, f, at, 0.04, { type: "triangle", gain, attack: 0.002, pan: (k % 2 ? -1 : 1) * 0.12 });
      this.burst(ctx, out, at, 0.012, { f: 3200, gain: 0.05 });
    }
    // soft whoosh under the ticks, fading as the wheel slows
    this.sweep(ctx, out, t0, T, { type: "bandpass", f0: 900, f1: 260, q: 0.9, gain: 0.03 });
    this.end(T + 0.1);
  }

  /** A level was cleared and the round goes on: pitch rises with the level. */
  climb(level: number) {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.01;
    const base = 523.25 * Math.pow(2, Math.min(Math.max(level, 1), 12) / 12); // C5 up to an octave higher at level 12
    this.tone(ctx, out, 2300, t, 0.13, { gain: 0.09, pan: 0.15 });
    this.tone(ctx, out, 2300 * 2.76, t, 0.08, { gain: 0.04, pan: 0.15 });
    this.bell(ctx, out, base, t + 0.03, 0.45, 0.1, -0.15);
    this.bell(ctx, out, base * 1.26, t + 0.11, 0.45, 0.095, 0.05); // major third
    this.bell(ctx, out, base * 1.5, t + 0.19, 0.55, 0.095, 0.2); // fifth
    this.end(0.9);
  }

  /** Coins taken, or the round paid out by itself. */
  reward(tier: RewardTier, level = 0) {
    this.coinReward(tier, pitchFor(level));
  }

  /** Fell on a danger slice: the round is over. */
  fail() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.01;
    this.tone(ctx, out, 130, t, 0.55, { gain: 0.3, endFreq: 46, attack: 0.01 }); // low thud
    this.tone(ctx, out, 329.6, t + 0.04, 0.5, { type: "triangle", gain: 0.12, endFreq: 300 }); // E4 sinking…
    this.tone(ctx, out, 261.6, t + 0.3, 0.6, { type: "triangle", gain: 0.12, endFreq: 233 }); // …to C4 (minor, falling)
    this.sweep(ctx, out, t, 0.7, { type: "lowpass", f0: 1000, f1: 160, q: 0.7, gain: 0.07 }); // dull crumble
    this.end(1.0);
  }

  /** For debugging in the console: window.__powerSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", enabled: this.enabled(), sources: this.sources.length };
  }

  /** Filtered noise with a sweeping centre frequency (whoosh / crumble). */
  private sweep(ctx: AudioContext, out: AudioNode, t: number, dur: number, o: { type: BiquadFilterType; f0: number; f1: number; q: number; gain: number }) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type;
    filt.Q.value = o.q;
    filt.frequency.setValueAtTime(o.f0, t);
    filt.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + Math.min(0.12, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
    this.sources.push(src);
  }
}

export const powerSfx = new PowerSfx();

if (typeof window !== "undefined") (window as unknown as { __powerSfx?: PowerSfx }).__powerSfx = powerSfx;
