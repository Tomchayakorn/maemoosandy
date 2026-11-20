/**
 * Client-safe description of the lucky wheel (no weights — those stay server-side
 * in rewards.ts). Segment order = clockwise from the top; index is what the API returns.
 */
export type RewardType = "coins" | "free_reading" | "luck_card" | "none";

export type WheelSegment = {
  key: string;
  type: RewardType;
  value: number;
  /** Short text printed on the wheel. */
  short: string;
  /** Full Thai label for the result modal. */
  label: string;
  tone: "dark" | "navy" | "gold" | "jackpot" | "dim";
};

export const WHEEL_SEGMENTS: readonly WheelSegment[] = [
  { key: "retry_a", type: "none", value: 0, short: "ลองใหม่", label: "ลองใหม่อีกครั้ง", tone: "dim" },
  { key: "coins_25", type: "coins", value: 25, short: "25", label: "25 เหรียญ (คืนครึ่งทุน)", tone: "navy" },
  { key: "coins_50", type: "coins", value: 50, short: "50", label: "50 เหรียญ (เท่าทุน)", tone: "dark" },
  { key: "luck_card", type: "luck_card", value: 1, short: "การ์ดเฮง", label: "การ์ด +ความเฮง 1 ใบ", tone: "gold" },
  { key: "coins_150", type: "coins", value: 150, short: "150", label: "150 เหรียญ (กำไร 3 เท่า)", tone: "navy" },
  { key: "coins_500", type: "coins", value: 500, short: "500", label: "500 เหรียญ (กำไร 10 เท่า)", tone: "gold" },
  { key: "free_reading", type: "free_reading", value: 1, short: "ดูดวงฟรี", label: "สิทธิ์ดูดวงฟรี 1 ครั้ง", tone: "dark" },
  { key: "jackpot_5000", type: "coins", value: 5000, short: "5,000", label: "แจ็กพอตใหญ่ 5,000 เหรียญ", tone: "jackpot" },
];

export type SpinResponse = {
  segmentIndex: number;
  reward: { key: string; type: RewardType; value: number; label: string };
  balance: number;
  spinTickets: number;
  freeReadingTickets: number;
  /** "การ์ด +ความเฮง" the player holds after this spin (absent when migration 0010 isn't installed). */
  luckCards?: number;
  /** Rounds left on the +ความเฮง buff after this spin (0 = none). */
  luckBuffRounds?: number;
  /** True when the buff was active for THIS spin (the 500-coin chance was boosted). */
  buffApplied?: boolean;
  /** True when this spin cost coins instead of a free ticket. */
  paid: boolean;
  /** Coins charged for this spin (0 for a free-ticket spin). */
  cost: number;
};

export type CheckinResponse = { granted: boolean; spinTickets: number };
