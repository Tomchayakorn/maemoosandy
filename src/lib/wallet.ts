import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Wallet } from "@/types/database";

/** The signed-in user's wallet, read through RLS (own row only). */
export async function getMyWallet(): Promise<Wallet | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wallets").select("*").maybeSingle();
  if (error) {
    console.error("getMyWallet failed", error.message);
    return null;
  }
  return data;
}
