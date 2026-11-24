/**
 * Consecutive daily check-in streak (Bangkok calendar days), computed from the player's existing `daily_checkins` dates.
 * Display only — nothing here grants anything; the check-in itself is still the `daily_checkin` RPC.
 *
 * The streak counts back from TODAY when today is already checked in, otherwise from YESTERDAY (it is still alive until the day ends).
 */
const DAY_MS = 86_400_000;

function shift(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

export function checkinStreak(dates: readonly string[], today: string): { streak: number; checkedInToday: boolean } {
  const set = new Set(dates);
  const checkedInToday = set.has(today);
  let day = checkedInToday ? today : shift(today, -1);
  let streak = 0;
  while (set.has(day)) {
    streak++;
    day = shift(day, -1);
  }
  return { streak, checkedInToday };
}

/** The short nudge shown under the streak counter. `streak` is the number of consecutive days so far. */
export function streakMessage(streak: number, checkedInToday: boolean): string {
  if (streak <= 0) return "เริ่มเช็กอินวันนี้ เพื่อเริ่มนับวันติดต่อกันและรับสิทธิ์หมุนฟรีทุกวันนะคะ";
  if (checkedInToday) return `พรุ่งนี้มาเช็กอินต่อ จะเป็นวันที่ ${streak + 1} ติดกัน แล้วหมุนฟรีรอบใหม่ได้เลยค่ะ`;
  return `เช็กอินวันนี้เพื่อต่อเป็นวันที่ ${streak + 1} ไม่ให้ขาดช่วง และรับสิทธิ์หมุนฟรีเพิ่มค่ะ`;
}
