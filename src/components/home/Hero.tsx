"use client";

import { motion, useReducedMotion } from "framer-motion";
import { StarField } from "@/components/fx/StarField";
import { LogoEmblem } from "@/components/ui/LogoEmblem";

/** Welcome section: glowing emblem, brand title and invitation copy. */
export function Hero() {
  const reduce = useReducedMotion();
  const fadeUp = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: "easeOut" as const },
        };

  return (
    <section className="relative isolate overflow-hidden px-4 pb-10 pt-12 text-center">
      <StarField />
      {/* halo behind the emblem */}
      <div
        aria-hidden
        className="absolute left-1/2 top-6 -z-10 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.28),transparent_65%)] blur-2xl"
      />

      <motion.div
        className="mx-auto mb-5 w-fit"
        {...(reduce
          ? {}
          : {
              animate: { y: [0, -8, 0] },
              transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            })}
      >
        {/* 112px (128px from sm) circle × 1.78 emblem scale */}
        <LogoEmblem className="size-28 sm:size-32" sizes="(min-width: 640px) 228px, 200px" glow="strong" eager />
      </motion.div>

      <motion.p {...fadeUp(0.05)} className="font-serif text-sm tracking-[0.25em] text-gold/90">
        ✦ บ้าน ณ มัณตรา ✦
      </motion.p>

      <motion.h1
        {...fadeUp(0.15)}
        className="mt-3 font-display text-5xl leading-[1.45] sm:text-6xl"
      >
        <span className="text-gold-gradient animate-shimmer">แม่มูแซนดี้</span>
        <br />
        <span className="text-gold-gradient animate-shimmer text-4xl sm:text-5xl">ทำนายดวงชะตา</span>
      </motion.h1>

      <motion.p {...fadeUp(0.3)} className="mx-auto mt-5 max-w-sm text-[15px] leading-relaxed text-cream/90">
        ยินดีต้อนรับสู่บ้าน ณ มัณตราค่ะ
        <br />
        ไม่ว่าใจจะสับสนเรื่องงาน เงิน หรือความรัก
        <br />
        แม่มูแซนดี้พร้อมสื่อจิตเปิดดวง
        <br />
        ชี้ทางสว่างให้ด้วยความเมตตา
      </motion.p>

      <motion.p {...fadeUp(0.42)} className="mt-3 text-xs text-cream-muted">
        ตั้งจิตให้มั่น แล้วเลือกศาสตร์ที่ใจเรียกหาด้านล่างนี้ได้เลย
      </motion.p>
    </section>
  );
}
