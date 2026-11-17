"use client";

import { bgm } from "./bgm";

/**
 * Synthesised sound effects for the lucky-wheel spin (Web Audio only — no audio files).
 *
 *   coins  — bright metallic clinks cascading, with a deep impact at the start
 *   zodiac — shimmering cosmic wind + crystal chimes, panned left→right or right→left
 *   orbit  — rising arcade-fantasy arpeggio that speeds up, plus a pitch sweep and a final shimmer
 *
 * Rules:
 *  reaper — dread swell, sub-bass thunder boom at the impact, dark cathedral brass/war-horn drone, scythe-slash ring
 *
 *  - Respects the header music toggle (bgm.getSnapshot().enabled === false ⇒ silent).
 *  - prime() must be called from the click that starts the spin (browsers only unlock audio in a gesture).
 *  - The background music is ducked while an effect plays; stop() fades the effect out in ~0.3s.
 */

export type WheelFx = "coins" | "zodiac" | "orbit" | "reaper";

/** When (seconds after the spin starts) the Grim Reaper lunges in; the visual and the boom are timed to this. */
export const REAPER_IMPACT_S = 0.4;
export type SweepDir = 1 | -1; // 1 = left→right, -1 = right→left

const DUCK_KEY = "wheel-sfx";
const MASTER = 0.55;

type PlayOpts = { seconds: number; dir: SweepDir };

class WheelSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private noise: AudioBuffer | null = null;
  private cleanup: ReturnType<typeof setTimeout> | null = null;
  private playing = false;

  private enabled() {
    return typeof window !== "undefined" && bgm.getSnapshot().enabled;
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** Call synchronously from the spin button's click handler. */
  prime() {
    if (!this.enabled()) return;
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  /** Start an effect lasting about `seconds`. No-op when muted. */
  play(fx: WheelFx, { seconds, dir }: PlayOpts) {
    this.stopNow();
    if (!this.enabled()) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.03;
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(MASTER, t0 + 0.06);
    this.master = master;
    this.playing = true;
    bgm.setDucked(DUCK_KEY, true);

    const d = Math.max(0.3, seconds);
    if (fx === "coins") this.coins(ctx, master, t0, d);
    else if (fx === "zodiac") this.zodiac(ctx, master, t0, d, dir);
    else if (fx === "reaper") this.reaper(ctx, master, t0, d);
    else this.orbit(ctx, master, t0, d);
  }

  /** Fade out and release everything (call when the wheel stops). */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    bgm.setDucked(DUCK_KEY, false);
    const ctx = this.ctx;
    const master = this.master;
    if (ctx && master) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    this.cleanup = setTimeout(() => this.stopNow(), 380);
  }

  private stopNow() {
    if (this.cleanup) clearTimeout(this.cleanup);
    this.cleanup = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    try {
      this.master?.disconnect();
    } catch {
      // ignore
    }
    this.master = null;
    if (this.playing) {
      this.playing = false;
      bgm.setDucked(DUCK_KEY, false);
    }
  }

  /** For debugging in the console: window.__wheelSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", playing: this.playing, sources: this.sources.length, enabled: this.enabled() };
  }

  /* ───────────── building blocks ───────────── */

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

  private panner(ctx: AudioContext, pan: number): AudioNode {
    if (typeof ctx.createStereoPanner !== "function") return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }

  /** One enveloped oscillator note routed through an optional pan. */
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
    const peak = o.gain ?? 0.2;
    const atk = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.panner(ctx, o.pan ?? 0)).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.sources.push(osc);
  }

  /** Filtered noise with a sweeping centre frequency and pan. */
  private wind(
    ctx: AudioContext,
    out: AudioNode,
    t: number,
    dur: number,
    o: { type: BiquadFilterType; f0: number; f1: number; q: number; gain: number; pan0: number; pan1: number; attack?: number },
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type;
    filt.Q.value = o.q;
    filt.frequency.setValueAtTime(o.f0, t);
    filt.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain();
    const atk = o.attack ?? 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + atk);
    g.gain.setValueAtTime(o.gain, t + Math.max(atk, dur - 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let chain: AudioNode = src.connect(filt).connect(g);
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(o.pan0, t);
      p.pan.linearRampToValueAtTime(o.pan1, t + dur);
      chain = chain.connect(p);
    }
    chain.connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
    this.sources.push(src);
  }

  /* ───────────── the three effects ───────────── */

  private coins(ctx: AudioContext, out: AudioNode, t0: number, dur: number) {
    // deep impact as the coins hit the screen
    this.tone(ctx, out, 120, t0, 0.45, { gain: 0.5, endFreq: 45, attack: 0.005 });
    this.wind(ctx, out, t0, 0.4, { type: "lowpass", f0: 1400, f1: 180, q: 0.8, gain: 0.35, pan0: 0, pan1: 0, attack: 0.01 });

    // cascading clinks: denser early, thinning out as the wheel slows
    const n = Math.max(8, Math.round(dur * 15));
    for (let k = 0; k < n; k++) {
      const t = t0 + 0.05 + Math.pow(Math.random(), 1.5) * dur * 0.95;
      const fade = 1 - ((t - t0) / dur) * 0.55;
      const f = 1700 + Math.random() * 1900;
      const pan = (Math.random() * 2 - 1) * 0.8;
      const life = 0.14 + Math.random() * 0.16;
      // metal ring = three inharmonic partials with a very fast attack
      this.tone(ctx, out, f, t, life, { type: "sine", gain: 0.2 * fade, pan });
      this.tone(ctx, out, f * 2.76, t, life * 0.7, { type: "sine", gain: 0.1 * fade, pan });
      this.tone(ctx, out, f * 5.4, t, life * 0.4, { type: "sine", gain: 0.05 * fade, pan });
      this.wind(ctx, out, t, 0.03, { type: "highpass", f0: 5200, f1: 6500, q: 0.7, gain: 0.07 * fade, pan0: pan, pan1: pan, attack: 0.004 });
    }
  }

  private zodiac(ctx: AudioContext, out: AudioNode, t0: number, dur: number, dir: SweepDir) {
    const a = -0.9 * dir;
    const b = 0.9 * dir;
    // cosmic wind sweeping across the stereo field, with an airy shimmer layer on top
    this.wind(ctx, out, t0, dur, { type: "bandpass", f0: 450, f1: 2600, q: 5, gain: 0.34, pan0: a, pan1: b });
    this.wind(ctx, out, t0, dur, { type: "bandpass", f0: 3200, f1: 6800, q: 10, gain: 0.13, pan0: a, pan1: b, attack: 0.5 });
    // soft pad underneath
    this.tone(ctx, out, 220, t0, dur, { type: "sine", gain: 0.06, attack: 0.6 });
    this.tone(ctx, out, 329.6, t0, dur, { type: "sine", gain: 0.04, attack: 0.8 });
    // crystal chimes that travel with the sweep
    const scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3];
    let t = t0 + 0.15;
    let i = Math.floor(Math.random() * scale.length);
    while (t < t0 + dur - 0.2) {
      const pos = (t - t0) / dur; // 0..1 along the sweep
      const pan = (a + (b - a) * pos) * (0.85 + Math.random() * 0.3);
      const f = scale[i % scale.length];
      this.tone(ctx, out, f, t, 1.1, { gain: 0.13, pan, attack: 0.006 });
      this.tone(ctx, out, f * 2.01, t, 0.7, { gain: 0.05, pan, attack: 0.006 });
      i += 1 + Math.floor(Math.random() * 3);
      t += 0.22 + Math.random() * 0.3;
    }
  }

  /** Cinematic: swell → boom → brass drone in a stone hall → scythe ring. Fades out by `dur` (the dissolve). */
  private reaper(ctx: AudioContext, out: AudioNode, t0: number, dur: number) {
    const hit = t0 + Math.min(REAPER_IMPACT_S, dur * 0.3);
    const end = t0 + dur;

    // "cathedral": a short generated impulse response, mixed in as a wet send
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.4), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    conv.connect(wet).connect(out);
    const bus = ctx.createGain(); // dry + wet
    bus.connect(out);
    bus.connect(conv);

    // 1) dread swell right before the impact
    this.wind(ctx, bus, t0, hit - t0 + 0.05, { type: "lowpass", f0: 70, f1: 380, q: 1.2, gain: 0.3, pan0: 0, pan1: 0, attack: 0.3 });
    this.tone(ctx, bus, 40, t0, hit - t0 + 0.05, { gain: 0.22, endFreq: 70, attack: 0.3 });

    // 2) the boom: sub-bass thunder + a sharp crack at the instant of impact
    this.tone(ctx, bus, 78, hit, 1.9, { gain: 0.8, endFreq: 26, attack: 0.004 });
    this.tone(ctx, bus, 52, hit, 1.5, { gain: 0.55, endFreq: 24, attack: 0.004 });
    this.wind(ctx, bus, hit, 1.7, { type: "lowpass", f0: 1000, f1: 60, q: 0.7, gain: 0.7, pan0: 0, pan1: 0, attack: 0.005 });
    this.wind(ctx, out, hit, 0.14, { type: "highpass", f0: 2600, f1: 1200, q: 0.7, gain: 0.45, pan0: 0, pan1: 0, attack: 0.002 });

    // 3) war-horn / cathedral brass: detuned saws through an opening low-pass, with slow vibrato
    const horn = (freq: number, gain: number) => {
      for (const cents of [-9, 9]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = cents;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 7;
        lfo.connect(lfoGain).connect(osc.detune);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.Q.value = 2;
        lp.frequency.setValueAtTime(160, hit);
        lp.frequency.exponentialRampToValueAtTime(1100, hit + 1.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, hit);
        g.gain.exponentialRampToValueAtTime(gain, hit + 0.55);
        g.gain.setValueAtTime(gain, Math.max(hit + 0.6, end - 1.2));
        g.gain.exponentialRampToValueAtTime(0.0001, end); // dissolves with the mist
        osc.connect(lp).connect(g).connect(bus);
        osc.start(hit);
        lfo.start(hit);
        osc.stop(end + 0.05);
        lfo.stop(end + 0.05);
        this.sources.push(osc, lfo);
      }
    };
    horn(58.27, 0.07); // Bb1
    horn(87.31, 0.06); // F2
    horn(116.54, 0.05); // Bb2
    horn(174.61, 0.03); // F3

    // 4) the scythe slash: airy sweep + inharmonic metallic ring
    const slash = hit + 0.12;
    this.wind(ctx, bus, slash, 0.3, { type: "highpass", f0: 3200, f1: 9500, q: 0.9, gain: 0.34, pan0: -0.8, pan1: 0.8, attack: 0.004 });
    this.tone(ctx, bus, 2093, slash + 0.1, 1.7, { gain: 0.15, pan: 0.2, attack: 0.002 });
    this.tone(ctx, bus, 2093 * 2.76, slash + 0.1, 1.1, { gain: 0.07, pan: -0.2, attack: 0.002 });
    this.tone(ctx, bus, 2093 * 5.4, slash + 0.1, 0.6, { gain: 0.03, attack: 0.002 });
  }

  private orbit(ctx: AudioContext, out: AudioNode, t0: number, dur: number) {
    // rising pitch sweep = anticipation
    const sweep = ctx.createOscillator();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(180, t0);
    sweep.frequency.exponentialRampToValueAtTime(1500, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.05, t0 + dur * 0.6);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    sweep.connect(lp).connect(sg).connect(out);
    sweep.start(t0);
    sweep.stop(t0 + dur + 0.05);
    this.sources.push(sweep);

    // arpeggio that climbs and speeds up
    const semis = [0, 2, 4, 7, 9];
    let t = t0 + 0.05;
    let step = 0.24;
    for (let k = 0; t < t0 + dur - 0.35; k++) {
      const octave = Math.min(3, Math.floor(k / 5));
      const f = 261.63 * Math.pow(2, (semis[k % 5] + 12 * octave) / 12);
      const pan = Math.sin(k * 0.9) * 0.5;
      this.tone(ctx, out, f, t, 0.2, { type: "triangle", gain: 0.2, pan });
      this.tone(ctx, out, f * 2, t, 0.14, { type: "square", gain: 0.035, pan });
      t += step;
      step = Math.max(0.065, step * 0.93);
    }
    // final shimmering chord, held until the wheel stops (stop() fades it)
    const tEnd = t0 + Math.max(0.1, dur - 0.3);
    [1046.5, 1318.5, 1568, 2093].forEach((f, j) => this.tone(ctx, out, f, tEnd, 0.7, { gain: 0.07, pan: (j - 1.5) * 0.4, attack: 0.05 }));
  }
}

export const wheelSfx = new WheelSfx();

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __wheelSfx?: WheelSfx }).__wheelSfx = wheelSfx;
}
