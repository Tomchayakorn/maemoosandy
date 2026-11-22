import "server-only";

import type { User } from "@supabase/supabase-js";

/** The emails listed in ADMIN_EMAILS (lower-case; comma-separated, server-only env). Empty list = nobody is admin. */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Admins are the emails listed in ADMIN_EMAILS (comma-separated, server-only env). Empty list = nobody is admin. */
export function isAdminUser(user: Pick<User, "email" | "email_confirmed_at"> | null): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  return getAdminEmails().includes(user.email.toLowerCase());
}
