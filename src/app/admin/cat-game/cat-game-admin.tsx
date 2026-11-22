"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import type { CatGameLookupResponse } from "@/app/api/admin/cat-game/lookup/route";

type ApiError = { error?: { message?: string } };

/** Admin: look a player up, see today's น้องเหมียว 9 ชีวิต play, and give the daily chance back. All checks happen on the server. */
export function CatGameAdmin() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<CatGameLookupResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function post<T>(url: string, body: unknown): Promise<T | null> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & ApiError) | null;
    if (!res.ok || !json) {
      setError(json?.error?.message ?? "ไม่สำเร็จ กรุณาลองใหม่");
      return null;
    }
    return json;
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setFound(null);
    try {
      setFound(await post<CatGameLookupResponse>("/api/admin/cat-game/lookup", { query }));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!found?.play || busy) return;
    if (!window.confirm(`ยืนยัน: คืนสิทธิ์เล่นวันนี้ให้ ${found.email ?? found.userId}?\n(เหรียญและประวัติเดิมไม่ถูกแก้ ผู้เล่นจะเล่นได้อีก 1 ครั้งโดยเสีย 9 เหรียญและได้รางวัลใหม่)`)) return;
    setBusy(true);
    setError(null);
    try {
      const out = await post<{ removed_reward: number }>("/api/admin/cat-game/reset", { userId: found.userId, reason: reason || undefined });
      if (out) {
        setDone(`คืนสิทธิ์แล้ว (ล้างผลเดิม ${out.removed_reward.toLocaleString("th-TH")} เหรียญออกจากโควตาวันนี้ ยอดเหรียญไม่เปลี่ยน)`);
        setFound({ ...found, play: null });
        setReason("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gold/25 bg-velvet/70 p-4">
      <form onSubmit={search} className="flex flex-col gap-2">
        <label htmlFor="cat-q" className="text-sm text-cream">
          ค้นหาผู้เล่น (อีเมลหรือรหัสผู้ใช้ ต้องตรงทั้งหมด)
        </label>
        <div className="flex gap-2">
          <input
            id="cat-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="email"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl border border-gold/40 bg-midnight px-3 text-sm text-cream outline-none focus:border-gold-light"
            placeholder="name@example.com"
          />
          <GoldButton type="submit" disabled={busy || query.trim().length < 3}>
            ค้นหา
          </GoldButton>
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {done && <p role="status" className="text-sm text-gold-light">{done}</p>}

      {found && (
        <div className="flex flex-col gap-2 rounded-xl border border-gold/20 bg-midnight/60 p-3 text-sm">
          <p className="text-cream">
            <b>{found.email ?? "(ไม่มีอีเมล)"}</b>
            <br />
            <span className="break-all font-tarot text-xs text-cream-muted">{found.userId}</span>
          </p>
          <p className="text-cream-muted">เหรียญคงเหลือ {found.balance.toLocaleString("th-TH")} · วันที่ (เวลาไทย) {found.today}</p>
          {found.play ? (
            <>
              <p className="text-cream">
                เล่นวันนี้แล้ว: ได้ <b className="text-gold-light">{found.play.reward.toLocaleString("th-TH")}</b> เหรียญ (เลือกตัวที่ {found.play.catIndex + 1})
              </p>
              <label htmlFor="cat-reason" className="text-xs text-cream-muted">
                เหตุผล (ไม่บังคับ บันทึกไว้ในประวัติ)
              </label>
              <input
                id="cat-reason"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                className="h-10 rounded-xl border border-gold/40 bg-midnight px-3 text-sm text-cream outline-none focus:border-gold-light"
              />
              <GoldButton onClick={reset} disabled={busy} className="w-full">
                คืนสิทธิ์เล่นวันนี้ให้ผู้เล่น
              </GoldButton>
            </>
          ) : (
            <p className="text-cream-muted">วันนี้ยังไม่ได้เล่น (มีสิทธิ์อยู่แล้ว ไม่ต้องรีเซ็ต)</p>
          )}
        </div>
      )}
    </section>
  );
}
