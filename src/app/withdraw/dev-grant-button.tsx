"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Testing helper, rendered only for admins outside production. */
export function DevGrantButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/dev/grant-withdrawal-quota", { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-full border border-dashed border-gold/50 px-4 py-2 text-xs text-gold-light hover:bg-gold/10 disabled:opacity-50"
    >
      [โหมดทดสอบ] รับสิทธิ์ถอนแจ็กพอต 1 สิทธิ์
    </button>
  );
}
