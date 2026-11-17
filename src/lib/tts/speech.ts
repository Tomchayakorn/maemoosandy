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

/** Best Thai voice on this device, or null when there is none. */
export function getThaiVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const thai = window.speechSynthesis.getVoices().filter(isThai);
  if (thai.length === 0) return null;
  return thai.reduce((best, v) => (scoreThaiVoice(v) > scoreThaiVoice(best) ? v : best));
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
 * Call inside a tap/click handler. Mobile Safari only lets a page speak after it
 * has spoken once during a user gesture, so we speak a silent utterance here.
 */
export function unlockSpeech(): void {
  if (!speechSupported()) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

export function cancelSpeech(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}
