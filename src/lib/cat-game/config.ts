/**
 * "น้องเหมียว 9 ชีวิต" — client-safe constants (the odds are public: every reward is equally likely).
 * COST and the reward whitelist are ALSO enforced inside the SQL function play_cat_game (migration 0016): change both together.
 */
export const CAT_GAME_COST = 9;
export const CAT_COUNT = 9;

/** The 5 prize levels in coins, all credited to the main wallet. Each has the same chance (1 in 5). */
export const CAT_REWARDS = [200, 300, 400, 500, 1000] as const;
export type CatReward = (typeof CAT_REWARDS)[number];

/** Average reward per play = sum / 5. */
export function expectedReward(): number {
  return CAT_REWARDS.reduce((s, r) => s + r, 0) / CAT_REWARDS.length;
}

const HOUR = 3_600_000;
const BANGKOK_OFFSET = 7 * HOUR; // Asia/Bangkok has no DST

/** Bangkok calendar date (YYYY-MM-DD) of an instant — matches public.bangkok_today(). */
export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET).toISOString().slice(0, 10);
}

/** The instant the daily limit resets: the next 00:00 in Bangkok. */
export function nextPlayAt(now: Date): Date {
  const local = now.getTime() + BANGKOK_OFFSET;
  return new Date((Math.floor(local / (24 * HOUR)) + 1) * 24 * HOUR - BANGKOK_OFFSET);
}

/** Reference model of the daily limit that play_cat_game enforces: one play per Bangkok calendar day. */
export function canPlayToday(lastPlayDate: string | null, now: Date): boolean {
  return lastPlayDate !== bangkokDate(now);
}

/**
 * Board: 9 cats = 3 orange + 3 black + 3 white, interleaved. Each colour has a LIST of images, so adding more pictures later is just
 * pushing a path onto that list (the 3 cats of a colour use list[i % list.length]). The reward never depends on the cat or its colour.
 */
export type CatColor = "orange" | "black" | "white";
export const CAT_IMAGES: Record<CatColor, readonly string[]> = {
  orange: ["/images/cat-orange.jpeg"],
  black: ["/images/cat-black.jpeg"],
  white: ["/images/cat-white.jpeg"],
};
const COLOR_ORDER: readonly CatColor[] = ["orange", "black", "white"];
const COLOR_LABEL: Record<CatColor, string> = { orange: "ส้ม", black: "ดำ", white: "ขาว" };

export type BoardCat = { index: number; color: CatColor; src: string; label: string };

export function buildBoard(images: Record<CatColor, readonly string[]> = CAT_IMAGES): BoardCat[] {
  return Array.from({ length: CAT_COUNT }, (_, index) => {
    const color = COLOR_ORDER[index % COLOR_ORDER.length];
    const nth = Math.floor(index / COLOR_ORDER.length); // 0..2 within the colour
    const list = images[color];
    return { index, color, src: list[nth % list.length], label: `น้องเหมียว${COLOR_LABEL[color]}ตัวที่ ${nth + 1}` };
  });
}

/** A short blessing shown with the reward (bigger prize, bigger blessing). */
export function catBlessing(reward: number): string {
  if (reward >= 1000) return "ว้าว! น้องเหมียวประทานโชคใหญ่ ขอให้ปีนี้ปังทุกเรื่อง เงินทองไหลมาเทมา 🐱✨";
  if (reward >= 500) return "โชคดีมากค่ะ ขอให้เหรียญนี้นำพาความเฮงไปตลอดทั้งสัปดาห์ 🍀";
  if (reward >= 400) return "น้องเหมียวส่งโชคมาให้เต็มๆ ขอให้งานการราบรื่นนะคะ ✨";
  if (reward >= 300) return "เหมียวนำโชคมาแล้ว ขอให้มีแต่เรื่องดีๆ เข้ามาไม่ขาดสาย 🐾";
  return "โชคดีเริ่มต้นแล้วค่ะ ขอให้เหรียญนี้งอกเงยต่อไป กลับมาเจอกันใหม่พรุ่งนี้นะคะ 🐱";
}
