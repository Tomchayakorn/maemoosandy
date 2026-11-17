"use client";

import Link from "next/link";
import { useEffect } from "react";
import { goldButtonClass } from "@/components/ui/GoldButton";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-center">
      <p className="font-serif text-xs tracking-[0.25em] text-gold-light">✦ ขออภัยค่ะ ✦</p>
      <h1 className="font-display text-4xl leading-snug">
        <span className="text-gold-gradient">ระบบขัดข้องชั่วคราว</span>
      </h1>
      <p className="text-sm text-cream/80">
        มีบางอย่างผิดพลาดระหว่างโหลดหน้านี้ ลองใหม่อีกครั้งนะคะ หากเพิ่งชำระหรือหมุนกงล้อ ยอดเหรียญของคุณจะไม่หายค่ะ
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={goldButtonClass({})}>
          ลองใหม่
        </button>
        <Link href="/" className={goldButtonClass({ variant: "outline" })}>
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
