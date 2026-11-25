"use client";

/**
 * Thin wrapper over the browser's Web Speech API for reading Mae Mu Sandy's
 * predictions aloud with the best Thai voice the device has.
 */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function isThai(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().replace("_", "-").startsWith("th");
}

/**
 * Higher is better. Neural/cloud voices sound far more natural than the
 * compact on-device ones:
 *  - Edge: "Microsoft Premwadee/Niwat Online (Natural)" — neural
 *  - macOS/iOS: "Kanya (Enhanced)" / "(Premium)" — downloadable high-quality voices
 *  - Chrome: "Google ไทย" — cloud voice
 *  - plain "Kanya" / "Microsoft Pattara" — compact, robotic
 */
export function scoreThaiVoice(voice: Pick<SpeechSynthesisVoice, "name" | "localService">): number {
  const name = voice.name;
  let score = 0;
  if (/natural|neural/i.test(name)) score += 100;
  if (/online/i.test(name)) score += 20;
  if (/premium/i.test(name)) score += 90;
  if (/enhanced/i.test(name)) score += 80;
  if (/siri/i.test(name)) score += 70;
  if (/google/i.test(name)) score += 60;
  if (/premwadee|achara|kanya/i.test(name)) score += 5; // female voices suit Mae Mu Sandy
  if (!voice.localService) score += 3;
  return score;
}

/** Every Thai voice on this device, best first (ties keep the device's own order). Used to fall back to the next voice when one fails. */
export function getThaiVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  const thai = window.speechSynthesis.getVoices().filter(isThai);
  return thai.map((v, i) => ({ v, i })).sort((a, b) => scoreThaiVoice(b.v) - scoreThaiVoice(a.v) || a.i - b.i).map((x) => x.v);
}

/** Best Thai voice on this device, or null when there is none. */
export function getThaiVoice(): SpeechSynthesisVoice | null {
  return getThaiVoices()[0] ?? null;
}

/** True when the chosen voice is one of the basic, robotic-sounding ones. */
export function isBasicVoice(voice: SpeechSynthesisVoice): boolean {
  return scoreThaiVoice(voice) < 50;
}

/** Voices load asynchronously in Chrome; wait until the list is populated (or give up). */
export function waitForVoices(timeoutMs = 2000): Promise<void> {
  if (!speechSupported() || window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

/**
 * Wait for a Thai voice to be available. Some mobile browsers fill the voice list late (or never fire `voiceschanged`), so besides the
 * event this polls every 150 ms, up to `timeoutMs`. Resolves to the best Thai voice, or null when there is none after the wait.
 */
export function waitForThaiVoice(timeoutMs = 4000): Promise<SpeechSynthesisVoice | null> {
  if (!speechSupported()) return Promise.resolve(null);
  const now = getThaiVoice();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const finish = (v: SpeechSynthesisVoice | null) => {
      synth.removeEventListener("voiceschanged", check);
      clearInterval(timer);
      clearTimeout(stop);
      resolve(v);
    };
    const check = () => {
      const v = getThaiVoice();
      if (v) finish(v);
    };
    const timer = setInterval(check, 150);
    const stop = setTimeout(() => finish(getThaiVoice()), timeoutMs);
    synth.addEventListener("voiceschanged", check);
  });
}

/**
 * Call inside a tap/click handler. Mobile Safari only lets a page speak after it
 * has spoken once during a user gesture, so we speak a silent utterance here.
 */
export function unlockSpeech(): void {
  if (!speechSupported()) return;
  // Same as the version that worked: a silent one-space utterance, no forced language/voice (a th-TH cloud voice left in the queue
  // could fail while being cancelled and then make the real reading fail too). Skip it when something is already queued.
  if (speechBusy()) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

/** Time to let a cancel settle before speaking again: Chrome on Android drops a speak() issued right after cancel(). */
export const CANCEL_SETTLE_MS = 250;

/** True when the engine still holds something (speaking, queued or paused) that a new reading would have to clear first. */
export function speechBusy(): boolean {
  if (!speechSupported()) return false;
  const s = window.speechSynthesis;
  return s.speaking || s.pending || s.paused;
}

/**
 * Clear the queue and any leftover "paused" state. cancel() alone does not reset a pause in Chrome, so a reading started after an earlier
 * pause would be queued but never heard.
 */
export function cancelSpeech(): void {
  if (!speechSupported()) return;
  const s = window.speechSynthesis;
  s.cancel();
  if (s.paused) s.resume();
}
