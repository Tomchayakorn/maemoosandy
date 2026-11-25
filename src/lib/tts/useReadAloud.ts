"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { bgm } from "@/lib/audio/bgm";
import { CANCEL_SETTLE_MS, cancelSpeech, isBasicVoice, speechBusy, speechSupported, waitForThaiVoice } from "./speech";
import { toSpeechPhrases } from "./thai-text";

/**
 * "blocked": the browser did not start the reading (mobile browsers often refuse speech that is not started by a tap, or silently drop it).
 * The UI then shows a clear "tap to listen" button — a tap is a user gesture, so it plays.
 */
export type ReadAloudStatus = "idle" | "loading" | "speaking" | "paused" | "done" | "no-voice" | "unsupported" | "blocked";

/** How long to wait for the first sound before calling the reading blocked. */
const START_WATCHDOG_MS = 2500;
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
  const mutedRef = useRef(muted);
  const runRef = useRef(0); // increments to invalidate callbacks from older runs

  const play = useCallback(async () => {
    if (!speechSupported()) {
      setStatus("unsupported");
      return;
    }
    const run = ++runRef.current;
    // 1) clear any old queue (and a leftover pause) so the new reading never waits behind it
    const hadOldQueue = speechBusy();
    cancelSpeech();
    setStatus("loading");
    // 2) let the cancel settle (only when something was actually cancelled)
    if (hadOldQueue) await sleep(CANCEL_SETTLE_MS);
    if (run !== runRef.current) return;
    // 3) find a Thai voice (the list can fill late on mobile)
    const voice = await waitForThaiVoice();
    if (run !== runRef.current) return;
    if (!voice) {
      setStatus("no-voice");
      return;
    }

    setBasicVoice(isBasicVoice(voice));
    const phrases = toSpeechPhrases(text);
    if (phrases.length === 0) {
      setStatus("idle");
      return;
    }
    let started = false;
    phrases.forEach((phrase, i) => {
      const u = new SpeechSynthesisUtterance(phrase.text);
      u.voice = voice;
      u.lang = voice.lang;
      // Slightly slow and level: high pitch exaggerates the sing-song accent of compact voices.
      u.rate = phrase.kind === "heading" ? 0.85 : 0.9;
      u.pitch = 1;
      if (i === 0)
        u.onstart = () => {
          started = true;
          if (run === runRef.current) setStatus("speaking");
        };
      if (i === phrases.length - 1) u.onend = () => run === runRef.current && setStatus("done");
      u.onerror = (e) => {
        if (run !== runRef.current || e.error === "interrupted" || e.error === "canceled") return;
        // "not-allowed": the browser refused speech that no tap started → show the tap-to-listen button
        setStatus(e.error === "not-allowed" ? "blocked" : "idle");
      };
      window.speechSynthesis.speak(u);
    });
    // 4) watchdog: if nothing was heard soon, say so instead of hanging on "preparing"
    setTimeout(() => {
      if (run === runRef.current && !started) {
        cancelSpeech();
        setStatus("blocked");
      }
    }, START_WATCHDOG_MS);
  }, [text]);

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
    else void play();
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

  return { status, muted, basicVoice, play, pause, resume, stop, toggleMuted };
}
