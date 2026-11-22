/**
 * Browser-side call of POST /api/cat-game/play, shared by the game page and the surprise pop-up.
 * No game logic here: the server draws, charges and credits; this only turns the response into a typed result.
 */
export type CatPlayResult =
  | { ok: true; reward: number; balance: number; nextPlayAt: string }
  | { ok: false; message: string; alreadyPlayed: boolean };

export async function playCatGame(catIndex: number, fetchFn: typeof fetch = fetch): Promise<CatPlayResult> {
  try {
    const res = await fetchFn("/api/cat-game/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catIndex }),
    });
    const json = (await res.json().catch(() => null)) as
      | { reward?: number; balance?: number; nextPlayAt?: string; error?: { code?: string; message?: string } }
      | null;
    if (res.ok && json && typeof json.reward === "number" && typeof json.balance === "number") {
      return { ok: true, reward: json.reward, balance: json.balance, nextPlayAt: json.nextPlayAt ?? "" };
    }
    return {
      ok: false,
      alreadyPlayed: json?.error?.code === "ALREADY_PLAYED_TODAY",
      message: json?.error?.message || "เล่นไม่สำเร็จ ลองใหม่อีกครั้งนะคะ (ไม่มีการหักเหรียญซ้ำ)",
    };
  } catch {
    return { ok: false, alreadyPlayed: false, message: "เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ" };
  }
}
