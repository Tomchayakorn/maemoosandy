"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { bgm } from "@/lib/audio/bgm";
import { CANCEL_SETTLE_MS, cancelSpeech, getThaiVoices, isBasicVoice, speechBusy, speechSupported, waitForThaiVoice } from "./speech";
import { toSpeechPhrases } from "./thai-text";

/**
 * "blocked": the browser did not start the reading by itself and dropped it (mobile browsers often refuse speech that no tap started).
 *            The UI then shows a clear "tap to listen" button — a tap is a user gesture, so it plays.
 * "failed":  every Thai voice on the device errored or stalled; `errorCode` says why (e.g. "synthesis-failed").
 */
export type ReadAloudStatus = "idle" | "loading" | "speaking" | "paused" | "done" | "no-voice" | "unsupported" | "blocked" | "failed";

/** After this long with the engine holding the queue but no sound yet, the voice is treated as stalled and the next voice is tried. */
const STALL_MS = 10_000;
/** How long the engine may show neither "speaking" nor "pending" before the speech counts as silently dropped. */
const DROP_CHECK_MS = 1500;
const POLL_MS = 250;
/** Pause before retrying a voice that just failed with synthesis-failed. */
const RETRY_PAUSE_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MUTE_KEY = "bnm:read-aloud-muted";

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the choice just isn't remembered.
  }
}

/**
 * Reads `text` aloud with the device's Thai voice. Starts automatically on mount
 * unless the viewer muted auto-reading earlier (remembered per device).
 */
export function useReadAloud(text: string) {
  const [status, setStatus] = useState<ReadAloudStatus>("idle");
  const [muted, setMuted] = useState<boolean>(readMuted);
  const [basicVoice, setBasicVoice] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const mutedRef = useRef(muted);
  const runRef = useRef(0); // increments to invalidate callbacks from older runs

  /**
   * Speak the reading with one voice. Resolves once the outcome of the START is known (speech then continues on its own):
   *  "started" · "dropped" (the engine silently ignored it) · "refused" (not-allowed) · {error} (the voice errored) · "stalled" · "stale".
   */
  function speakWith(voice: SpeechSynthesisVoice | null, phrases: ReturnType<typeof toSpeechPhrases>, run: number): Promise<"started" | "dropped" | "refused" | "stalled" | "stale" | { error: string }> {
    return new Promise((resolve) => {
      let started = false;
      let settled = false;
      const settle = (v: Parameters<typeof resolve>[0]) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        resolve(v);
      };
      phrases.forEach((phrase, i) => {
        const u = new SpeechSynthesisUtterance(phrase.text);
        // voice === null: let the browser pick its own default Thai voice (last resort)
        if (voice) u.voice = voice;
        u.lang = voice ? voice.lang : "th-TH";
        // Slightly slow and level: high pitch exaggerates the sing-song accent of compact voices.
        u.rate = phrase.kind === "heading" ? 0.85 : 0.9;
        u.pitch = 1;
        if (i === 0)
          u.onstart = () => {
            started = true;
            if (run === runRef.current) setStatus("speaking");
            settle("started");
          };
        if (i === phrases.length - 1) u.onend = () => run === runRef.current && started && setStatus("done");
        u.onerror = (e) => {
          if (run !== runRef.current || e.error === "interrupted" || e.error === "canceled") return;
          if (!started) settle(e.error === "not-allowed" ? "refused" : { error: e.error });
          else setStatus("idle"); // an error in the middle of the reading: stop quietly, the button replays it
        };
        window.speechSynthesis.speak(u);
      });
      const t0 = performance.now();
      const poll = setInterval(() => {
        if (run !== runRef.current) return settle("stale");
        if (started) return;
        const age = performance.now() - t0;
        const engineHasIt = window.speechSynthesis.speaking || window.speechSynthesis.pending;
        // slow is fine (a cloud voice can take seconds to begin): only give up when the engine dropped it or it stalls for long
        if (!engineHasIt && age > DROP_CHECK_MS) settle("dropped");
        else if (age > STALL_MS) settle("stalled");
      }, POLL_MS);
    });
  }

  /**
   * Start (or restart) the reading. `fromTap`: called from a tap — a refusal then is a real failure of that voice, while a silent drop of an
   * automatic start becomes the "tap to listen" state.
   */
  const play = useCallback(
    async (fromTap = false) => {
      if (!speechSupported()) {
        setStatus("unsupported");
        return;
      }
      const run = ++runRef.current;
      // 1) clear any old queue (and a leftover pause) so the new reading never waits behind it
      const hadOldQueue = speechBusy();
      cancelSpeech();
      setStatus("loading");
      setErrorCode(null);
      // 2) let the cancel settle (only when something was actually cancelled)
      if (hadOldQueue) await sleep(CANCEL_SETTLE_MS);
      if (run !== runRef.current) return;
      // 3) find Thai voices (the list can fill late on mobile)
      if (!(await waitForThaiVoice())) {
        if (run === runRef.current) setStatus("no-voice");
        return;
      }
      if (run !== runRef.current) return;
      const voices = getThaiVoices();
      const phrases = toSpeechPhrases(text);
      if (voices.length === 0 || phrases.length === 0) {
        setStatus(voices.length === 0 ? "no-voice" : "idle");
        return;
      }

      // 4) try the voices best-first until one starts; a slow start is waited for, a failed one is retried once (after a longer pause,
      //    a speak() right after an error often fails again) and then skipped. Last resort: the browser's own default Thai voice.
      let lastError = "no-sound";
      const candidates: (SpeechSynthesisVoice | null)[] = [...voices, null];
      for (const voice of candidates) {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (run !== runRef.current) return;
          if (voice) setBasicVoice(isBasicVoice(voice));
          const outcome = await speakWith(voice, phrases, run);
          if (outcome === "stale" || outcome === "started") return;
          if (outcome === "dropped" && !fromTap) {
            // an automatic start the browser ignored: ask for a tap instead of trying other voices
            cancelSpeech();
            setStatus("blocked");
            return;
          }
          lastError = typeof outcome === "string" ? (outcome === "refused" ? "not-allowed" : outcome) : outcome.error;
          cancelSpeech();
          await sleep(attempt === 0 ? RETRY_PAUSE_MS : CANCEL_SETTLE_MS);
          if (typeof outcome === "string" || outcome.error !== "synthesis-failed") break; // only a synthesis failure is worth one more try
        }
      }
      if (run === runRef.current) {
        setErrorCode(lastError);
        setStatus("failed");
      }
    },
    // speakWith only uses refs and stable setters
    [text],
  );

  /** Silence the device and make callbacks from the current run stale. */
  const cancelRun = useCallback(() => {
    runRef.current++;
    cancelSpeech();
  }, []);

  const stop = useCallback(() => {
    cancelRun();
    setStatus("idle");
  }, [cancelRun]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setStatus("speaking");
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    writeMuted(next);
    setMuted(next);
    if (next) stop();
    else void play(true); // switching auto-read on is a tap
  }, [play, stop]);

  // Duck the background music only while Mae Mu Sandy is actually speaking;
  // pausing, finishing, muting or leaving the reading brings it back up.
  const duckKey = `read-aloud-${useId()}`;
  useEffect(() => {
    bgm.setDucked(duckKey, status === "speaking");
  }, [duckKey, status]);
  useEffect(() => () => bgm.setDucked(duckKey, false), [duckKey]);

  // Auto-read when a new reading arrives; always stop when it goes away.
  useEffect(() => {
    if (!mutedRef.current) void play();
    return cancelRun;
  }, [play, cancelRun]);

  return { status, muted, basicVoice, errorCode, play, pause, resume, stop, toggleMuted };
}
