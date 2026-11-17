import Link from "next/link";
import { goldButtonClass } from "@/components/ui/GoldButton";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-20 text-center">
      <p className="font-serif text-xs tracking-[0.25em] text-gold-light">✦ 404 ✦</p>
      <h1 className="font-display text-4xl leading-snug">
        <span className="text-gold-gradient">ไม่พบหน้านี้</span>
      </h1>
      <p className="text-sm text-cream/80">
        ดวงดาวพาคุณหลงทางเสียแล้วค่ะ หน้าที่ตามหาอาจถูกย้ายหรือไม่มีอยู่จริง กลับไปเริ่มต้นใหม่ที่หน้าแรกนะคะ
      </p>
      <Link href="/" className={goldButtonClass({ size: "lg" })}>
        กลับหน้าแรก
      </Link>
    </main>
  );
}
