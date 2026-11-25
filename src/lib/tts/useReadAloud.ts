"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { bgm } from "@/lib/audio/bgm";
import { cancelSpeech, getThaiVoice, isBasicVoice, speechSupported, waitForThaiVoice } from "./speech";
import { toSpeechPhrases } from "./thai-text";

/**
 * "blocked": an automatic start never began (mobile browsers often refuse speech that no tap started) — a tap plays it.
 * "failed":  the engine reported an error other than synthesis-failed; `errorCode` says which one.
 * A synthesis-failed just returns to "idle": no error box, the normal play button stays.
 */
export type ReadAloudStatus = "idle" | "loading" | "speaking" | "paused" | "done" | "no-voice" | "unsupported" | "blocked" | "failed";

/** No first sound after this long: give the button back (nothing is cancelled, so a late start still plays). */
const START_TIMEOUT_MS = 8000;
/** After resume(), how long before an engine that stayed silent is restarted from the beginning. */
const RESUME_CHECK_MS = 500;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // keeps the utterances alive: Chrome may garbage-collect queued ones and then never fire their events
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);

  /** Clear the queue and speak the whole reading right now — synchronous, so a tap's user gesture reaches speak(). */
  const speakNow = useCallback(
    (auto: boolean) => {
      const run = ++runRef.current;
      clearTimeout(timerRef.current);
      cancelSpeech();
      setErrorCode(null);
      const phrases = toSpeechPhrases(text);
      if (phrases.length === 0) {
        setStatus("idle");
        return;
      }
      // null: let the browser pick its own default voice for th-TH
      const voice = getThaiVoice();
      if (voice) setBasicVoice(isBasicVoice(voice));
      setStatus("loading");

      utterancesRef.current = phrases.map((phrase, i) => {
        const u = new SpeechSynthesisUtterance(phrase.text);
        if (voice) u.voice = voice;
        u.lang = "th-TH";
        // Slightly slow and level: high pitch exaggerates the sing-song accent of compact voices.
        u.rate = phrase.kind === "heading" ? 0.85 : 0.9;
        u.pitch = 1;
        u.onstart = () => {
          if (run !== runRef.current) return;
          clearTimeout(timerRef.current);
          setStatus((s) => (s === "paused" ? s : "speaking"));
        };
        if (i === phrases.length - 1) u.onend = () => run === runRef.current && setStatus("done");
        u.onerror = (e) => {
          if (run !== runRef.current || e.error === "interrupted" || e.error === "canceled") return;
          runRef.current++; // this round is over: no further speech calls, ignore the other utterances' errors
          clearTimeout(timerRef.current);
          cancelSpeech();
          if (e.error === "synthesis-failed") setStatus("idle");
          else if (e.error === "not-allowed") setStatus("blocked");
          else if (e.error === "language-unavailable" || e.error === "voice-unavailable") setStatus("no-voice");
          else {
            setErrorCode(e.error);
            setStatus("failed");
          }
        };
        return u;
      });
      for (const u of utterancesRef.current) window.speechSynthesis.speak(u);

      timerRef.current = setTimeout(() => {
        if (run === runRef.current) setStatus((s) => (s === "loading" ? (auto ? "blocked" : "idle") : s));
      }, START_TIMEOUT_MS);
    },
    [text],
  );

  /** Start (or restart) from a tap. */
  const play = useCallback(() => {
    if (!speechSupported()) setStatus("unsupported");
    else speakNow(false);
  }, [speakNow]);

  /** Silence the device and make callbacks from the current run stale. */
  const cancelRun = useCallback(() => {
    runRef.current++;
    clearTimeout(timerRef.current);
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
    const run = runRef.current;
    window.speechSynthesis.resume();
    setStatus("speaking");
    // some mobile engines treat pause() as cancel(): nothing left to resume, so read again from the start
    timerRef.current = setTimeout(() => {
      if (run === runRef.current && !window.speechSynthesis.speaking) speakNow(false);
    }, RESUME_CHECK_MS);
  }, [speakNow]);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    writeMuted(next);
    setMuted(next);
    if (next) stop();
    else play(); // switching auto-read on is a tap
  }, [play, stop]);

  // Duck the background music only while Mae Mu Sandy is actually speaking;
  // pausing, finishing, muting or leaving the reading brings it back up.
  const duckKey = `read-aloud-${useId()}`;
  useEffect(() => {
    bgm.setDucked(duckKey, status === "speaking");
  }, [duckKey, status]);
  useEffect(() => () => bgm.setDucked(duckKey, false), [duckKey]);

  // Auto-read when a new reading arrives (after the voice list has loaded); always stop when it goes away.
  useEffect(() => {
    let alive = true;
    const run = runRef.current;
    if (!mutedRef.current) {
      void (async () => {
        const supported = speechSupported();
        if (supported) await waitForThaiVoice();
        // a tap during the wait wins over the automatic start
        if (!alive || run !== runRef.current) return;
        if (supported) speakNow(true);
        else setStatus("unsupported");
      })();
    }
    return () => {
      alive = false;
      cancelRun();
    };
  }, [speakNow, cancelRun]);

  return { status, muted, basicVoice, errorCode, play, pause, resume, stop, toggleMuted };
}
