"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import { formatThaiDateTime } from "@/components/topup/topup-labels";
import { VOUCHER_STATUS_LABEL, type VoucherStatus } from "@/lib/voucher";

export type VoucherListItem = {
  id: string;
  code: string;
  coins: number;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string;
  is_active: boolean;
  note: string | null;
  created_by: string;
  created_at: string;
  status: VoucherStatus;
};

const STATUS_CLASS: Record<VoucherStatus, string> = {
  active: "text-emerald-300",
  disabled: "text-cream-muted",
  expired: "text-rose-300",
  full: "text-amber-300",
};

/** Default expiry in the form: tomorrow 23:59 Bangkok. */
function defaultExpiry(): string {
  const t = new Date(Date.now() + 7 * 3_600_000 + 24 * 3_600_000);
  return `${t.toISOString().slice(0, 10)}T23:59`;
}

export function VoucherAdmin({ vouchers }: { vouchers: VoucherListItem[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [coins, setCoins] = useState("100");
  const [uses, setUses] = useState("50");
  const [expires, setExpires] = useState(defaultExpiry);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() || undefined, coins: Number(coins), maxRedemptions: Number(uses), expiresAtLocal: expires, note: note.trim() || undefined }),
      });
      const json = (await res.json().catch(() => null)) as { code?: string; error?: { message?: string } } | null;
      if (!res.ok) return setMsg({ ok: false, text: json?.error?.message ?? "สร้างโค้ดไม่สำเร็จ" });
      setMsg({ ok: true, text: `สร้างโค้ดแล้ว: ${json?.code}` });
      setCode("");
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(v: VoucherListItem) {
    if (busy) return;
    if (!window.confirm(v.is_active ? `ปิดโค้ด ${v.code}? (ผู้ที่ใช้ไปแล้วไม่ถูกแตะ)` : `เปิดโค้ด ${v.code} อีกครั้ง?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/vouchers/${v.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !v.is_active }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMsg({ ok: false, text: j?.error?.message ?? "ไม่สำเร็จ" });
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const field = "h-11 w-full min-w-0 rounded-xl border border-gold/40 bg-midnight px-3 text-sm text-cream outline-none focus:border-gold-light";
  return (
    <>
      <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-gold/25 bg-velvet/70 p-4">
        <h2 className="font-serif text-lg text-gold-light">สร้างโค้ดใหม่</h2>
        <label className="flex flex-col gap-1 text-sm text-cream">
          โค้ด (เว้นว่าง = ให้ระบบสุ่มให้)
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={24} autoCapitalize="characters" placeholder="เช่น MAEMU2026" className={field + " font-tarot tracking-widest"} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-cream">
            เหรียญที่ได้
            <input type="number" inputMode="numeric" min={1} max={10000} required value={coins} onChange={(e) => setCoins(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-cream">
            จำนวนสิทธิ์รวม
            <input type="number" inputMode="numeric" min={1} max={10000} required value={uses} onChange={(e) => setUses(e.target.value)} className={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-cream">
          หมดอายุ (เวลาไทย)
          <input type="datetime-local" required value={expires} onChange={(e) => setExpires(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-cream">
          บันทึกช่วยจำ (ไม่บังคับ)
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ไลฟ์วันศุกร์ 22 พ.ย." className={field} />
        </label>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={"text-sm " + (msg.ok ? "text-gold-light" : "text-rose-300")}>
            {msg.text}
          </p>
        )}
        <GoldButton type="submit" disabled={busy} className="w-full">
          สร้างโค้ด
        </GoldButton>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg text-gold-light">โค้ดทั้งหมด</h2>
        {vouchers.length === 0 ? (
          <p className="text-sm text-cream-muted">ยังไม่มีโค้ด</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vouchers.map((v) => (
              <li key={v.id} className="rounded-2xl border border-gold/25 bg-velvet/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="break-all font-tarot text-lg tracking-widest text-gold-light">{v.code}</b>
                  <span className={"text-xs " + STATUS_CLASS[v.status]}>{VOUCHER_STATUS_LABEL[v.status]}</span>
                </div>
                <p className="mt-1 text-xs text-cream-muted">
                  +{v.coins.toLocaleString("th-TH")} เหรียญ · ใช้แล้ว <b className="text-cream">{v.redeemed_count}</b>/{v.max_redemptions} · หมดอายุ {formatThaiDateTime(v.expires_at)}
                  <br />
                  สร้างโดย {v.created_by} · {formatThaiDateTime(v.created_at)}
                  {v.note ? ` · ${v.note}` : ""}
                </p>
                <GoldButton variant="outline" onClick={() => toggle(v)} disabled={busy} className="mt-2 h-9 px-4 text-xs">
                  {v.is_active ? "ปิดโค้ดนี้" : "เปิดโค้ดนี้"}
                </GoldButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
