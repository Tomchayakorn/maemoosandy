"use client";

import { bgm } from "./bgm";
import type { RewardTier } from "@/lib/mystic/sfx-tier";

/**
 * Synthesised sound effects for เปิดหีบมนตรา (Web Audio only — no audio files, nothing to download or fail).
 *
 *   open()        — the moment the player taps a chest: a wooden latch thunk, a short creak and three soft magical sparkles
 *   reward(tier)  — the moment a prize shows: gold coin clinks and a bright chime arpeggio; the bigger the tier the grander it gets
 *                   (small → good → big → jackpot: more coins, a warm chord, a deep boom and a shimmer for the top tier)
 *
 * Rules (same as the lucky-wheel effects):
 *  - Silent when the header music toggle is off (bgm.getSnapshot().enabled === false) — one switch controls all sound.
 *  - Only ever called from a user's tap. prime() / open() resume the AudioContext inside that gesture (browsers refuse otherwise);
 *    if the context cannot start, the call quietly does nothing.
 *  - Everything runs through one master gain and a compressor, so layered clinks never spike; peak level is kept well below full scale.
 *  - The background music is ducked while an effect sounds and released when it ends.
 */

const DUCK_KEY = "chest-sfx";
const MASTER = 0.6;

class ChestSfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  private enabled() {
    return typeof window !== "undefined" && bgm.getSnapshot().enabled;
  }

  private ensure(): { ctx: AudioContext; out: GainNode } | null {
    if (this.ctx && this.out) return { ctx: this.ctx, out: this.out };
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const out = ctx.createGain();
      out.gain.value = MASTER;
      // gentle limiter so many overlapping clinks can never jump out
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 14;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      out.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.out = out;
    } catch {
      return null;
    }
    return { ctx: this.ctx!, out: this.out! };
  }

  /** Call from the click that starts a round / a tap, so the browser lets the audio start later. */
  prime() {
    if (!this.enabled()) return;
    const a = this.ensure();
    if (a && a.ctx.state === "suspended") void a.ctx.resume();
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
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.02;
    const plan = {
      small: { clinks: 3, span: 0.35, chimes: [1318.5], pad: false, boom: false, shimmer: false, len: 0.9 },
      good: { clinks: 6, span: 0.6, chimes: [1046.5, 1318.5, 1568], pad: false, boom: false, shimmer: false, len: 1.3 },
      big: { clinks: 12, span: 1.0, chimes: [1046.5, 1318.5, 1568, 2093], pad: true, boom: false, shimmer: true, len: 1.9 },
      jackpot: { clinks: 20, span: 1.5, chimes: [1046.5, 1318.5, 1568, 2093, 2637, 3136], pad: true, boom: true, shimmer: true, len: 2.6 },
    }[tier];

    if (plan.boom) this.tone(ctx, out, 110, t, 0.55, { gain: 0.22, endFreq: 48, type: "sine", attack: 0.01 });
    // coin clinks: three inharmonic partials with a very fast attack, denser early and thinning out
    for (let k = 0; k < plan.clinks; k++) {
      const at = t + 0.03 + Math.pow(Math.random(), 1.4) * plan.span;
      const fade = 1 - ((at - t) / (plan.span + 0.2)) * 0.5;
      const f = 1900 + Math.random() * 1500;
      const pan = (Math.random() * 2 - 1) * 0.7;
      const life = 0.13 + Math.random() * 0.14;
      this.tone(ctx, out, f, at, life, { gain: 0.11 * fade, pan });
      this.tone(ctx, out, f * 2.76, at, life * 0.7, { gain: 0.055 * fade, pan });
      this.tone(ctx, out, f * 5.4, at, life * 0.4, { gain: 0.025 * fade, pan });
    }
    // bright chime arpeggio (rising)
    plan.chimes.forEach((f, i) => this.bell(ctx, out, f, t + 0.08 + i * 0.085, 0.55, 0.07, ((i % 3) - 1) * 0.3));
    // warm major chord underneath for the grand tiers (C4 E4 G4, +C5 for the top tier)
    if (plan.pad) [261.6, 329.6, 392, ...(tier === "jackpot" ? [523.3] : [])].forEach((f) => this.pad(ctx, out, f, t + 0.12, plan.len - 0.3, 0.05));
    if (plan.shimmer) this.burst(ctx, out, t + 0.1, 0.9, { f: 6200, gain: 0.03, slow: true });
    this.end(plan.len);
  }

  /** Cut everything (leaving the page). */
  stop() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    bgm.setDucked(DUCK_KEY, false);
  }

  /** For debugging in the console: window.__chestSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", enabled: this.enabled(), sources: this.sources.length };
  }

  /* ───────────── internals ───────────── */

  private begin(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.enabled()) return null;
    const a = this.ensure();
    if (!a) return null;
    if (a.ctx.state === "suspended") void a.ctx.resume();
    bgm.setDucked(DUCK_KEY, true);
    return a;
  }

  /** Release the music ducking once the effect has finished (a newer effect pushes the release back). */
  private end(seconds: number) {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.sources = [];
      bgm.setDucked(DUCK_KEY, false);
      this.releaseTimer = null;
    }, seconds * 1000 + 150);
  }

  private noiseBuffer(ctx: AudioContext) {
    if (!this.noise) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  private pan(ctx: AudioContext, value: number): AudioNode {
    if (typeof ctx.createStereoPanner !== "function") return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, value));
    return p;
  }

  /** One enveloped oscillator note. */
  private tone(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    t: number,
    dur: number,
    o: { type?: OscillatorType; gain?: number; pan?: number; attack?: number; endFreq?: number },
  ) {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.1, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.pan(ctx, o.pan ?? 0)).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.sources.push(osc);
  }

  /** A soft bell: sine fundamental + a quiet octave partial. */
  private bell(ctx: AudioContext, out: AudioNode, freq: number, t: number, dur: number, gain: number, pan: number) {
    this.tone(ctx, out, freq, t, dur, { gain, pan, attack: 0.006 });
    this.tone(ctx, out, freq * 2, t, dur * 0.6, { gain: gain * 0.3, pan, attack: 0.006 });
  }

  /** A slow, warm triangle note with a soft attack and release. */
  private pad(ctx: AudioContext, out: AudioNode, freq: number, t: number, dur: number, gain: number) {
    this.tone(ctx, out, freq, t, dur, { type: "triangle", gain, attack: 0.18 });
  }

  /** Short filtered noise burst (latch click, shimmer). */
  private burst(ctx: AudioContext, out: AudioNode, t: number, dur: number, o: { f: number; gain: number; slow?: boolean }) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = o.f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + (o.slow ? 0.25 : 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
    this.sources.push(src);
  }

  /** Lid creak: a quiet saw sliding up through a low-pass. */
  private creak(ctx: AudioContext, out: AudioNode, t: number) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(235, t + 0.32);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.4);
    this.sources.push(osc);
  }
}

export const chestSfx = new ChestSfx();

if (typeof window !== "undefined") (window as unknown as { __chestSfx?: ChestSfx }).__chestSfx = chestSfx;
