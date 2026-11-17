import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { MysticCard } from "@/components/ui/MysticCard";
import { EmblemIcon } from "@/components/ui/icons";
import { isSupabaseConfigured, LINE_PROVIDER_ID } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <EmblemIcon className="size-16 drop-shadow-[0_0_18px_rgb(212_175_55/0.45)]" />
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">ก้าวเข้าสู่บ้าน ณ มัณตรา</span>
        </h1>
        <p className="text-sm leading-relaxed text-cream-muted">
          เข้าสู่ระบบเพื่อให้แม่มูแซนดี้เปิดดวงชะตา
          <br />
          สมาชิกใหม่รับสิทธิ์หมุนกงล้อมหาเฮงฟรีทันที 1 ครั้ง
        </p>
      </div>

      <MysticCard className="p-5 sm:p-6">
        <Suspense fallback={<div className="h-[420px] animate-pulse rounded-2xl bg-velvet/40" />}>
          <LoginForm configured={isSupabaseConfigured()} lineEnabled={Boolean(LINE_PROVIDER_ID)} />
        </Suspense>
      </MysticCard>

      <p className="text-center text-xs leading-relaxed text-cream-muted/70">
        การเข้าสู่ระบบถือว่าคุณยอมรับเงื่อนไขการใช้บริการ
        <br />
        คำทำนายเป็นไปเพื่อความบันเทิงและเป็นแนวทางในการใช้ชีวิต
      </p>
    </main>
  );
}
