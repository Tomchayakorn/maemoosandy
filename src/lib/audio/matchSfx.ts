"use client";

import { bgm } from "./bgm";
import { SfxBase } from "./sfxBase";

/**
 * Synthesised sound effects for จับคู่ภาพเหมือน (Web Audio only — no audio files).
 *
 *   flip()            — a card is tapped: a crisp paper snap and a small bright tick (~0.25 s)
 *   match(delay)      — a pair is found: two rising bells and a coin clink
 *   miss(delay)       — no match: two soft, low notes going down
 *   clear(delay)      — all six pairs: coin shower and a climbing chord
 *   over(delay)       — the turns ran out: a calm closing chord
 *
 * The synthesis toolkit, mute rule (header music toggle), music ducking and level limiting live in SfxBase.
 */
class MatchSfx extends SfxBase {
  private waiting: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    super("match-game-sfx");
    // switching sound off in the header silences an effect that is already playing
    bgm.subscribe(() => {
      if (!bgm.getSnapshot().enabled) this.stop();
    });
  }

  flip() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.005;
    this.burst(ctx, out, t, 0.03, { f: 3000, gain: 0.18 });
    this.burst(ctx, out, t + 0.025, 0.12, { f: 1600, gain: 0.05 });
    this.bell(ctx, out, 1568, t + 0.01, 0.16, 0.07, -0.15);
    this.end(0.25);
  }

  match(delaySeconds = 0) {
    this.later(delaySeconds, () => {
      const a = this.begin();
      if (!a) return;
      const { ctx, out } = a;
      const t = ctx.currentTime + 0.02;
      [1046.5, 1568, 2093].forEach((f, i) => this.bell(ctx, out, f, t + i * 0.09, 0.45, 0.12, (i - 1) * 0.35));
      this.tone(ctx, out, 3100, t + 0.2, 0.12, { gain: 0.05, pan: 0.25 });
      this.end(0.8);
    });
  }

  miss(delaySeconds = 0) {
    this.later(delaySeconds, () => {
      const a = this.begin();
      if (!a) return;
      const { ctx, out } = a;
      const t = ctx.currentTime + 0.02;
      this.tone(ctx, out, 330, t, 0.22, { type: "triangle", gain: 0.09, attack: 0.01 });
      this.tone(ctx, out, 247, t + 0.14, 0.32, { type: "triangle", gain: 0.08, attack: 0.01 });
      this.end(0.55);
    });
  }

  clear(delaySeconds = 0) {
    this.later(delaySeconds, () => {
      this.coinReward("big");
      const a = this.begin();
      if (!a) return;
      const { ctx, out } = a;
      const t = ctx.currentTime + 0.05;
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.pad(ctx, out, f, t + i * 0.16, 1.1 - i * 0.08, 0.045));
      this.end(2);
    });
  }

  over(delaySeconds = 0) {
    this.later(delaySeconds, () => {
      const a = this.begin();
      if (!a) return;
      const { ctx, out } = a;
      const t = ctx.currentTime + 0.02;
      [440, 554.4, 659.3].forEach((f, i) => this.pad(ctx, out, f, t + i * 0.12, 0.9, 0.05));
      this.bell(ctx, out, 880, t + 0.4, 0.7, 0.07, 0);
      this.end(1.4);
    });
  }

  override stop() {
    this.waiting.forEach(clearTimeout);
    this.waiting = [];
    super.stop();
  }

  /** Sounds that follow a card flip wait for it to finish turning. */
  private later(seconds: number, play: () => void) {
    if (seconds <= 0) return play();
    const timer = setTimeout(() => {
      this.waiting = this.waiting.filter((w) => w !== timer);
      play();
    }, seconds * 1000);
    this.waiting.push(timer);
  }

  /** For debugging in the console: window.__matchSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", enabled: this.enabled(), sources: this.sources.length };
  }
}

export const matchSfx = new MatchSfx();

if (typeof window !== "undefined") (window as unknown as { __matchSfx?: MatchSfx }).__matchSfx = matchSfx;
