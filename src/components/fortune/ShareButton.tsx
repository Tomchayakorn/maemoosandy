"use client";

import { useState, type RefObject } from "react";
import { toBlob } from "html-to-image";
import { goldButtonClass } from "@/components/ui/GoldButton";

/**
 * Captures the referenced element as a PNG and opens the native share sheet
 * (mobile), falling back to a download.
 */
export function ShareButton({
  targetRef,
  fileName = "mae-mu-sandy-reading.png",
  disabled,
}: {
  targetRef: RefObject<HTMLElement | null>;
  fileName?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleShare() {
    const node = targetRef.current;
    if (!node) return;
    setBusy(true);
    setNote(null);
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: "#0b0a12",
        cacheBust: true,
        filter: (el) => !(el instanceof HTMLElement && el.dataset.shareIgnore === "true"),
      });
      if (!blob) throw new Error("capture failed");
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "คำทำนายจากแม่มูแซนดี้",
          text: "คำทำนายจากแม่มูแซนดี้ บ้าน ณ มัณตรา",
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        setNote("บันทึกภาพคำทำนายแล้วค่ะ");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setNote("บันทึกภาพไม่สำเร็จ ลองแคปหน้าจอแทนได้นะคะ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleShare}
        disabled={disabled || busy}
        className={goldButtonClass({ variant: "outline", className: "w-full" })}
      >
        {busy ? "กำลังสร้างภาพ..." : "บันทึกภาพ / แชร์คำทำนาย"}
      </button>
      {note && <p className="text-xs text-cream-muted">{note}</p>}
    </div>
  );
}
