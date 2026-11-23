"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Props = {
  href: string;
  title: string;
  description: string;
  price: ReactNode;
  icon: ReactNode;
  index: number;
  highlight?: boolean;
  /** Small glowing corner tag (top right). Only the cards that pass it get one. */
  badge?: string;
  badgeTone?: "gold-red" | "violet";
};

/** Service menu card on the home page. */
export function ServiceCard({ href, title, description, price, icon, index, highlight, badge, badgeTone = "gold-red" }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
    >
      <Link
        href={href}
        className={
          "group border-gold-frame relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 transition " +
          "bg-[linear-gradient(150deg,rgb(21_19_31/0.95),rgb(18_26_51/0.95))] hover:border-gold active:scale-[0.99] " +
          (highlight ? "ring-1 ring-gold/40 " : "") +
          // the corner tag sits in its own strip above the content, so it never covers the title
          (badge ? "pt-9" : "")
        }
      >
        {/* sweeping sheen on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-gold-light/10 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100"
        />
        {badge && (
          <span className={"home-badge-wrap " + (badgeTone === "violet" ? "home-badge-violet" : "home-badge-hot")}>
            <span aria-hidden className="home-badge-glow" />
            <span className="home-badge">{badge}</span>
          </span>
        )}
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-velvet/80 text-gold shadow-[inset_0_0_18px_rgb(212_175_55/0.15)]">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-serif text-base font-semibold leading-snug text-cream">{title}</span>
          <span className="text-xs leading-relaxed text-cream-muted">{description}</span>
          <span className="mt-1 text-sm font-semibold text-gold-light">{price}</span>
        </span>
        <span aria-hidden className="text-xl text-gold transition group-hover:translate-x-1">
          ›
        </span>
      </Link>
    </motion.div>
  );
}
