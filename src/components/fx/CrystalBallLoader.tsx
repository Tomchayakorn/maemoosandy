"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const DEFAULT_MESSAGES = [
  "แม่มูแซนดี้กำลังสื่อจิตเปิดดวงชะตา...",
  "กำลังถอดรหัสจากบ้าน ณ มัณตรา...",
  "ดวงดาวกำลังเรียงตัวบอกคำตอบ...",
  "ตั้งจิตให้นิ่ง แม่มูใกล้ได้คำตอบแล้วนะคะ...",
];

/** Crystal-ball waiting screen with rotating, mood-building messages. */
export function CrystalBallLoader({ messages = DEFAULT_MESSAGES }: { messages?: string[] }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2500);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-8 py-10">
      <div className="relative size-52">
        {/* outer glow */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.45),transparent_68%)] blur-xl"
          animate={reduce ? undefined : { scale: [0.9, 1.08, 0.9], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <svg viewBox="0 0 200 220" className="relative size-full" aria-hidden>
          <defs>
            <radialGradient id="ball-body" cx="40%" cy="35%" r="70%">
              <stop offset="0" stopColor="#3a4a8a" />
              <stop offset="0.55" stopColor="#141c3d" />
              <stop offset="1" stopColor="#07091a" />
            </radialGradient>
            <linearGradient id="ball-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f3d98b" />
              <stop offset="0.5" stopColor="#d4af37" />
              <stop offset="1" stopColor="#a8841f" />
            </linearGradient>
            <clipPath id="ball-clip">
              <circle cx="100" cy="92" r="78" />
            </clipPath>
          </defs>
          {/* stand */}
          <path d="M52 178h96l-12 24H64l-12-24Z" fill="url(#ball-gold)" />
          <ellipse cx="100" cy="178" rx="50" ry="9" fill="#a8841f" />
          {/* sphere */}
          <circle cx="100" cy="92" r="78" fill="url(#ball-body)" stroke="url(#ball-gold)" strokeWidth="2" />
          <g clipPath="url(#ball-clip)">
            <circle cx="100" cy="92" r="40" fill="#d4af37" opacity="0.12" />
            <motion.g
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
            >
              {/* invisible square keeps the group's box centred on the ball, so it spins in place */}
              <rect x="22" y="14" width="156" height="156" fill="none" />
              <path d="M30 100c30-40 80-50 140-10" stroke="#f3d98b" strokeOpacity="0.8" strokeWidth="3" fill="none" />
              <path d="M40 70c40 10 70 40 120 30" stroke="#d4af37" strokeOpacity="0.65" strokeWidth="2" fill="none" />
              <path d="M50 130c30-20 60-25 100 0" stroke="#f6efdc" strokeOpacity="0.5" strokeWidth="2" fill="none" />
              <circle cx="70" cy="80" r="2.5" fill="#f3d98b" />
              <circle cx="130" cy="110" r="2" fill="#f6efdc" />
              <circle cx="115" cy="60" r="1.6" fill="#f3d98b" />
            </motion.g>
            {/* specular highlight */}
            <ellipse cx="72" cy="58" rx="22" ry="12" fill="#ffffff" opacity="0.14" transform="rotate(-30 72 58)" />
          </g>
        </svg>
      </div>

      <div className="h-14 px-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="on-photo font-serif text-base text-gold-light"
          >
            {messages[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
