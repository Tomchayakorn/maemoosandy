"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StaticReading } from "@/components/fortune/StaticReading";
import { formatThaiDateTime, packageName, shortReason, STATUS_LABEL } from "@/components/topup/topup-labels";
import { goldButtonClass } from "@/components/ui/GoldButton";

type Topup = {
  id: string;
  package_id: string;
  amount_thb: number;
  coins_added: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
};
type Reading = {
  id: string;
  fortune_type: "tarot" | "birthdate";
  question: string | null;
  result_text: string;
  coins_spent: number;
  used_free_ticket: boolean;
  created_at: string;
};
type Spin = { id: string; reward_key: string; reward_type: string; reward_value: number; created_at: string };

const TABS = [
  { key: "readings", label: "คำทำนาย" },
  { key: "topups", label: "เติมเหรียญ" },
  { key: "spins", label: "กงล้อ" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function Empty({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/15 bg-velvet/50 px-4 py-8 text-center text-sm text-cream-muted">
      {text}
      <Link href={href} className={goldButtonClass({ variant: "outline" })}>
        {cta}
      </Link>
    </div>
  );
}

function spinLabel(s: Spin): string {
  if (s.reward_type === "coins") return `${s.reward_value} เหรียญโบนัส`;
  if (s.reward_type === "free_reading") return "สิทธิ์ดูดวงฟรี";
  if (s.reward_type === "luck_card") return "การ์ด +ความเฮง";
  return "ลองใหม่อีกครั้ง";
}

export function HistoryTabs({ topups, readings, spins }: { topups: Topup[]; readings: Reading[]; spins: Spin[] }) {
  const [tab, setTab] = useState<TabKey>("readings");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-3 rounded-full border border-gold/30 bg-velvet/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`relative z-10 h-10 rounded-full text-sm transition-colors ${tab === t.key ? "text-velvet" : "text-cream-muted hover:text-cream"}`}
          >
            {tab === t.key && (
              <motion.span
                layoutId="history-tab"
                className="absolute inset-0 -z-10 rounded-full bg-[linear-gradient(135deg,var(--gold-light),var(--gold))]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "readings" &&
        (readings.length === 0 ? (
          <Empty text="ยังไม่มีคำทำนายค่ะ" href="/tarot" cta="เปิดไพ่ยิปซี" />
        ) : (
          <ul className="flex flex-col gap-3">
            {readings.map((r) => {
              const isOpen = open === r.id;
              return (
                <li key={r.id} className="border-gold-frame overflow-hidden rounded-2xl bg-velvet-soft/80">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gold-light">
                        {r.fortune_type === "tarot" ? "ไพ่ยิปซี 3 ใบ" : "ดวงชื่อและวันเกิด"}
                      </p>
                      {r.question && <p className="truncate text-xs text-cream/85">“{r.question}”</p>}
                      <p className="text-[11px] text-cream-muted">
                        {formatThaiDateTime(r.created_at)} · {r.used_free_ticket ? "ใช้สิทธิ์ฟรี" : `${r.coins_spent} เหรียญ`}
                      </p>
                    </div>
                    <span aria-hidden className={`mt-1 text-gold transition ${isOpen ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-gold/15 px-4 py-4">
                          <StaticReading text={r.result_text} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "topups" &&
        (topups.length === 0 ? (
          <Empty text="ยังไม่มีรายการเติมเหรียญค่ะ" href="/topup" cta="เติมเหรียญ" />
        ) : (
          <ul className="flex flex-col divide-y divide-gold/10 overflow-hidden rounded-2xl border border-gold/15 bg-velvet/50">
            {topups.map((t) => {
              const label = STATUS_LABEL[t.status] ?? STATUS_LABEL.pending;
              const reason = t.status === "success" ? null : shortReason(t.failure_reason);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cream">
                      {packageName(t.package_id)} · {Number(t.amount_thb)} บาท
                    </p>
                    <p className="text-[11px] text-cream-muted">
                      {formatThaiDateTime(t.created_at)}
                      {reason ? ` · ${reason}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${label.className}`}>{label.text}</span>
                    {t.coins_added > 0 && <span className="text-xs font-semibold text-gold-light">+{t.coins_added}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "spins" &&
        (spins.length === 0 ? (
          <Empty text="ยังไม่เคยหมุนกงล้อค่ะ" href="/lucky-wheel" cta="ไปหมุนกงล้อ" />
        ) : (
          <ul className="flex flex-col divide-y divide-gold/10 overflow-hidden rounded-2xl border border-gold/15 bg-velvet/50">
            {spins.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-cream">{spinLabel(s)}</span>
                <span className="text-[11px] text-cream-muted">{formatThaiDateTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
