"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  signInAction,
  signInWithOAuthAction,
  signUpAction,
  type AuthFormState,
} from "./actions";
import { goldButtonClass } from "@/components/ui/GoldButton";
import { GoogleIcon, LineIcon } from "@/components/ui/icons";

const URL_ERRORS: Record<string, string> = {
  oauth: "เข้าสู่ระบบผ่านบัญชีภายนอกไม่สำเร็จ กรุณาลองใหม่",
  callback: "ลิงก์ยืนยันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง",
  provider: "ช่องทางเข้าสู่ระบบนี้ยังไม่เปิดให้บริการ",
  not_configured: "ระบบสมาชิกยังไม่ได้เชื่อมต่อ Supabase — โปรดตั้งค่า .env.local ก่อน",
};

type Mode = "signin" | "signup";

const inputClass =
  "h-12 w-full rounded-xl border border-gold/30 bg-velvet/70 px-4 text-cream placeholder:text-cream-muted/50 " +
  "outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";

export function LoginForm({ configured, lineEnabled }: { configured: boolean; lineEnabled: boolean }) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const urlError = URL_ERRORS[searchParams.get("error") ?? ""];

  const [mode, setMode] = useState<Mode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [signInState, signIn, signingIn] = useActionState<AuthFormState, FormData>(signInAction, {});
  const [signUpState, signUp, signingUp] = useActionState<AuthFormState, FormData>(signUpAction, {});

  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <div className="flex flex-col gap-5">
      {!configured && (
        <p className="rounded-xl border border-ruby/50 bg-ruby/10 px-4 py-3 text-sm text-cream">
          {URL_ERRORS.not_configured}
        </p>
      )}

      {/* Tabs */}
      <div role="tablist" className="relative grid grid-cols-2 rounded-full border border-gold/30 bg-velvet/60 p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`relative z-10 h-10 rounded-full text-sm font-medium transition-colors ${
              mode === m ? "text-velvet" : "text-cream-muted hover:text-cream"
            }`}
          >
            {mode === m && (
              <motion.span
                layoutId="auth-tab"
                className="absolute inset-0 -z-10 rounded-full bg-[linear-gradient(135deg,var(--gold-light),var(--gold))]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            {m === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.form
          key={mode}
          action={mode === "signin" ? signIn : signUp}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="next" value={next} />

          {mode === "signup" && (
            <label className="flex flex-col gap-1.5 text-sm text-cream-muted">
              ชื่อที่ให้แม่มูเรียก
              <input
                name="displayName"
                autoComplete="nickname"
                required
                maxLength={80}
                placeholder="เช่น น้องฟ้า"
                className={inputClass}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm text-cream-muted">
            อีเมล
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              defaultValue={state.email}
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-cream-muted">
            รหัสผ่าน
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                maxLength={72}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className={`${inputClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-xs text-gold-light hover:bg-gold/10"
              >
                {showPassword ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </label>

          {(state.error || (!state.message && urlError)) && (
            <p role="alert" className="rounded-xl border border-ruby/50 bg-ruby/10 px-4 py-3 text-sm text-cream">
              {state.error ?? urlError}
            </p>
          )}
          {state.message && (
            <p role="status" className="rounded-xl border border-jade/50 bg-jade/10 px-4 py-3 text-sm text-cream">
              {state.message}
            </p>
          )}

          <button type="submit" disabled={pending} className={goldButtonClass({ size: "lg", className: "w-full" })}>
            {pending ? "กำลังเปิดประตูบ้าน ณ มัณตรา..." : mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก รับสิทธิ์หมุนฟรี 1 ครั้ง"}
          </button>
        </motion.form>
      </AnimatePresence>

      <div className="flex items-center gap-3 text-xs text-cream-muted">
        <span className="h-px flex-1 bg-gold/20" />
        หรือ
        <span className="h-px flex-1 bg-gold/20" />
      </div>

      <div className="flex flex-col gap-3">
        <form action={signInWithOAuthAction}>
          <input type="hidden" name="provider" value="google" />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-cream text-sm font-medium text-velvet transition hover:bg-white active:scale-[0.98]"
          >
            <GoogleIcon className="size-5" />
            ดำเนินการต่อด้วย Google
          </button>
        </form>
        {lineEnabled && (
          <form action={signInWithOAuthAction}>
            <input type="hidden" name="provider" value="line" />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#06C755] text-sm font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
            >
              <LineIcon className="size-5" />
              ดำเนินการต่อด้วย LINE
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
