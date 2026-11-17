"use client";

/**
 * Background music for บ้าน ณ มัณตรา (public/tarot-bgm.mp3, 60s loop).
 *
 * One shared engine for the whole app. Volume goes through a Web Audio GainNode
 * rather than HTMLAudioElement.volume, because iOS Safari ignores .volume.
 *
 *  - Normal level 0.18, "ducked" level 0.06 while Mae Mu Sandy is speaking.
 *  - Ducking fades down fast (0.5s) and recovers slowly (1.2s) so the voice
 *    never fights the music and the return feels natural.
 *  - Browsers block audible autoplay, so playback starts on the first tap/key.
 *  - The on/off choice is remembered per device (localStorage).
 */

const SRC = "/tarot-bgm.mp3";
const NORMAL_LEVEL = 0.18;
const DUCKED_LEVEL = 0.06;
const FADE_DOWN_S = 0.5;
const FADE_UP_S = 1.2;
const FADE_OUT_OFF_S = 0.6;
const PREF_KEY = "bnm:bgm-enabled";

export type BgmState = {
  /** The listener's preference: music on or off. */
  enabled: boolean;
  /** Audio is actually playing (false until the first user gesture). */
  playing: boolean;
  /** A voice is currently ducking the music. */
  ducked: boolean;
};

type Listener = () => void;

function readPref(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function writePref(enabled: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  } catch {
    // storage unavailable: preference just isn't remembered
  }
}

class BgmEngine {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private fallbackRaf = 0;
  private duckers = new Set<string>();
  private listeners = new Set<Listener>();
  private state: BgmState = { enabled: true, playing: false, ducked: false };
  private hydrated = false;

  /* ---------- store API (for useSyncExternalStore) ---------- */

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): BgmState => {
    if (!this.hydrated && typeof window !== "undefined") {
      this.hydrated = true;
      this.state = { ...this.state, enabled: readPref() };
    }
    return this.state;
  };

  getServerSnapshot = (): BgmState => SERVER_STATE;

  private set(patch: Partial<BgmState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /* ---------- audio graph ---------- */

  private ensureGraph() {
    if (this.audio) return;
    const audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = "auto";
    this.audio = audio;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      try {
        const ctx = new Ctor();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
        this.ctx = ctx;
        this.gain = gain;
        return;
      } catch {
        // fall through to element volume
      }
    }
    audio.volume = 0;
  }

  private currentLevel(): number {
    if (this.gain) return this.gain.gain.value;
    return this.audio?.volume ?? 0;
  }

  /** Smoothly move the volume to `level` over `seconds`. */
  private rampTo(level: number, seconds: number) {
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      const g = this.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + seconds);
      return;
    }
    // Fallback without Web Audio: animate element volume.
    const audio = this.audio;
    if (!audio) return;
    cancelAnimationFrame(this.fallbackRaf);
    const from = audio.volume;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / (seconds * 1000));
      audio.volume = from + (level - from) * k;
      if (k < 1) this.fallbackRaf = requestAnimationFrame(step);
    };
    this.fallbackRaf = requestAnimationFrame(step);
  }

  private targetLevel(): number {
    if (!this.state.enabled) return 0;
    return this.duckers.size > 0 ? DUCKED_LEVEL : NORMAL_LEVEL;
  }

  /* ---------- public controls ---------- */

  /** Call from a user gesture. Starts playback if the listener wants music. */
  async start() {
    this.getSnapshot();
    if (!this.state.enabled || this.state.playing) return;
    this.ensureGraph();
    try {
      // Call play() synchronously inside the gesture (iOS requires it); resume the context alongside.
      const playing = this.audio!.play();
      const resumed = this.ctx?.resume();
      await Promise.all([playing, resumed]);
      this.set({ playing: true });
      this.rampTo(this.targetLevel(), FADE_UP_S * 1.5);
    } catch {
      // Autoplay still blocked (no gesture yet) — the next gesture will retry.
    }
  }

  /** Music on/off (the header toggle). Must be called from the click handler. */
  async setEnabled(enabled: boolean) {
    writePref(enabled);
    this.set({ enabled });
    if (enabled) {
      if (this.state.playing) this.rampTo(this.targetLevel(), FADE_UP_S);
      else await this.start();
      return;
    }
    if (!this.state.playing || !this.audio) return;
    this.rampTo(0, FADE_OUT_OFF_S);
    const audio = this.audio;
    window.setTimeout(() => {
      if (!this.state.enabled) {
        audio.pause();
        this.set({ playing: false });
      }
    }, FADE_OUT_OFF_S * 1000 + 50);
  }

  /** Lower the music while a voice (identified by `key`) is speaking. */
  setDucked(key: string, on: boolean) {
    const had = this.duckers.has(key);
    if (on === had) return;
    if (on) this.duckers.add(key);
    else this.duckers.delete(key);
    this.set({ ducked: this.duckers.size > 0 });
    if (this.state.playing) this.rampTo(this.targetLevel(), on ? FADE_DOWN_S : FADE_UP_S);
  }

  /** Quietly pause while the tab is hidden; resume (faded) when it returns. */
  setPageVisible(visible: boolean) {
    if (!this.audio || !this.state.enabled) return;
    if (!visible && this.state.playing) {
      this.rampTo(0, 0.3);
      window.setTimeout(() => document.hidden && this.audio?.pause(), 350);
    } else if (visible && this.state.playing && this.audio.paused) {
      void this.ctx?.resume();
      void this.audio.play().then(() => this.rampTo(this.targetLevel(), FADE_UP_S)).catch(() => {});
    }
  }

  /** For tests / debugging. */
  debug() {
    return { level: +this.currentLevel().toFixed(3), duckers: [...this.duckers], ...this.state, webAudio: Boolean(this.gain) };
  }
}

const SERVER_STATE: BgmState = { enabled: true, playing: false, ducked: false };

export const bgm = new BgmEngine();

export const BGM_LEVELS = { normal: NORMAL_LEVEL, ducked: DUCKED_LEVEL } as const;
