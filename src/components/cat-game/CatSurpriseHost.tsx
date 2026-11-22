import { connection } from "next/server";
import { bangkokDate } from "@/lib/cat-game/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";
import { CatSurpriseLive } from "./CatSurpriseLive";

/**
 * Server side of the cat-game surprise (put it in its own <Suspense fallback={null}> on a page): reads the wallet and whether
 * today's play (Bangkok date) is unused, then hands over to the live client component that follows the balance.
 * Renders nothing when signed out or when migration 0016 isn't installed (the game isn't available).
 */
export async function CatSurpriseHost() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null;
  const day = bangkokDate(new Date());
  const [wallet, played] = await Promise.all([
    getMyWallet(),
    (await createClient()).from("cat_game_plays").select("id").eq("play_date", day).maybeSingle(),
  ]);
  if (!wallet || played.error) return null;
  // keep rendering after today's play so a result shown in the pop-up is not lost when the page refreshes
  return <CatSurpriseLive userId={user.id} bangkokDay={day} initialBalance={wallet.balance} playedToday={!!played.data} />;
}
