"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, LINE_PROVIDER_ID } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthFormState = {
  error?: string;
  message?: string;
  email?: string;
};

const credentialsSchema = z.object({
  email: z.email("รูปแบบอีเมลไม่ถูกต้อง").trim().toLowerCase(),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร").max(72, "รหัสผ่านยาวเกินไป"),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, "กรุณากรอกชื่อที่ให้แม่มูเรียก").max(80, "ชื่อยาวเกินไป"),
});

const NOT_CONFIGURED: AuthFormState = {
  error: "ระบบสมาชิกยังไม่ได้เชื่อมต่อ Supabase — โปรดตั้งค่า .env.local ก่อน",
};

/** Map Supabase auth error messages to friendly Thai. */
function thaiAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (m.includes("email not confirmed")) return "กรุณายืนยันอีเมลก่อน — ตรวจสอบกล่องจดหมายของคุณ";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "อีเมลนี้สมัครสมาชิกแล้ว ลองเข้าสู่ระบบแทนนะคะ";
  if (m.includes("password")) return "รหัสผ่านไม่ปลอดภัยพอ ลองใช้ตัวอักษรผสมตัวเลขที่ยาวขึ้น";
  if (m.includes("rate limit") || m.includes("too many"))
    return "ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: thaiAuthError(error.message), email };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const origin = await siteOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: thaiAuthError(error.message), email };

  // Email confirmation enabled → no session yet.
  if (!data.session) {
    return {
      message: "สมัครสำเร็จ! แม่มูส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว กดยืนยันแล้วกลับมาเข้าสู่ระบบได้เลยค่ะ",
      email,
    };
  }
  redirect(next);
}

export async function signInWithOAuthAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/login?error=not_configured");

  const requested = String(formData.get("provider") ?? "");
  const provider =
    requested === "google" ? "google" : LINE_PROVIDER_ID && requested === "line" ? LINE_PROVIDER_ID : null;
  if (!provider) redirect("/login?error=provider");

  const next = safeNextPath(String(formData.get("next") ?? ""));
  const origin = await siteOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google" | `custom:${string}`,
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
