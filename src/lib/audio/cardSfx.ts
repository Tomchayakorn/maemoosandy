"use client";

import { bgm } from "./bgm";
import { SfxBase } from "./sfxBase";
import type { CardSoundTier } from "@/lib/lucky-card/sfx-tier";

/**
 * Synthesised sound effects for ดวงดี มีเฮ (Web Audio only — no audio files).
 *
 *   flip()                 — the tap on a card: a crisp snap, a short paper swish and a bright tick (~0.35 s)
 *   result(tier, delay)    — the result shows: gentle chime / three notes / coins / rising celebration chord / grand fanfare
 *
 * The synthesis toolkit, mute rule (header music toggle), music ducking and level limiting live in SfxBase.
 * speechSynthesis is never touched.
 */
class CardSfx extends SfxBase {
  private pendingResult: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super("lucky-card-sfx");
    // switching sound off in the header silences an effect that is already playing
    bgm.subscribe(() => {
      if (!bgm.getSnapshot().enabled) this.stop();
    });
  }

  /** Tap on a card. */
  flip() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.005;
    this.burst(ctx, out, t, 0.03, { f: 3200, gain: 0.22 }); // snap
    this.burst(ctx, out, t + 0.03, 0.16, { f: 1700, gain: 0.07 }); // swish
    this.bell(ctx, out, 1975.5, t + 0.01, 0.16, 0.09, -0.2);
    this.bell(ctx, out, 2637, t + 0.09, 0.2, 0.07, 0.25);
    this.end(0.35);
  }

  /** The result shows. `delaySeconds` keeps it from talking over the flip when the server answers very fast. */
  result(tier: CardSoundTier, delaySeconds = 0) {
    this.cancelPending();
    if (delaySeconds <= 0) return this.playResult(tier);
    this.pendingResult = setTimeout(() => {
      this.pendingResult = null;
      this.playResult(tier);
    }, delaySeconds * 1000);
  }

  override stop() {
    this.cancelPending();
    super.stop();
  }

  private cancelPending() {
    if (this.pendingResult) clearTimeout(this.pendingResult);
    this.pendingResult = null;
  }

  private playResult(tier: CardSoundTier) {
    if (tier === "good") return this.coinReward("good");
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const t = ctx.currentTime + 0.02;

    if (tier === "soft") {
      // a warm, quiet rising pair (E5 → G5)
      this.bell(ctx, out, 659.3, t, 0.35, 0.09, -0.1);
      this.bell(ctx, out, 784, t + 0.13, 0.45, 0.08, 0.15);
      this.end(0.6);
      return;
    }
    if (tier === "coins") {
      // three clear notes (E6 → G6 → C7) with a little coin clink
      [1318.5, 1568, 2093].forEach((f, i) => this.bell(ctx, out, f, t + i * 0.09, 0.4, 0.14, (i - 1) * 0.3));
      this.tone(ctx, out, 3100, t + 0.02, 0.12, { gain: 0.05, pan: -0.3 });
      this.tone(ctx, out, 3600, t + 0.11, 0.1, { gain: 0.04, pan: 0.3 });
      this.end(0.8);
      return;
    }
    // big / secret: the shared coin shower first, then a chord that climbs C → E → G → C (and higher for the secret prize)
    const grand = tier === "secret";
    this.coinReward(grand ? "jackpot" : "big");
    const steps = grand ? [523.3, 659.3, 784, 1046.5, 1318.5, 1568] : [523.3, 659.3, 784, 1046.5];
    steps.forEach((f, i) => this.pad(ctx, out, f, t + 0.05 + i * 0.16, (grand ? 1.6 : 1.1) - i * 0.08, 0.045));
    if (grand) [2093, 2637, 3136].forEach((f, i) => this.bell(ctx, out, f, t + 1.25 + i * 0.08, 0.8, 0.06, (i - 1) * 0.5));
    this.end(grand ? 2.8 : 2);
  }

  /** For debugging in the console: window.__cardSfx.debug() */
  debug() {
    return { ctx: this.ctx?.state ?? "none", enabled: this.enabled(), sources: this.sources.length };
  }
}

export const cardSfx = new CardSfx();

if (typeof window !== "undefined") (window as unknown as { __cardSfx?: CardSfx }).__cardSfx = cardSfx;
