"use client";

import { useEffect } from "react";
import { bgm } from "@/lib/audio/bgm";

/**
 * Mounted once in the root layout. Starts the background music on the first
 * user gesture (browsers block audible autoplay) and pauses it while the tab
 * is hidden. Renders nothing.
 */
export function BgmBootstrap() {
  useEffect(() => {
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const onGesture = (e: Event) => {
      // Let the music toggle decide for itself (avoids a blip when the first tap is "mute").
      if ((e.target as Element | null)?.closest?.("[data-bgm-toggle]")) return;
      void bgm.start().then(() => {
        if (bgm.getSnapshot().playing || !bgm.getSnapshot().enabled) {
          events.forEach((e) => window.removeEventListener(e, onGesture, true));
        }
      });
    };
    events.forEach((e) => window.addEventListener(e, onGesture, true));

    const onVisibility = () => bgm.setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __bgm?: typeof bgm }).__bgm = bgm;
    }

    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
