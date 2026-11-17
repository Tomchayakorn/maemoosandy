/**
 * Client-safe description of the lucky wheel (no weights — those stay server-side
 * in rewards.ts). Segment order = clockwise from the top; index is what the API returns.
 */
export type RewardType = "coins" | "free_reading" | "none";

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
  { key: "coins_10_a", type: "coins", value: 10, short: "10", label: "10 เหรียญ", tone: "navy" },
  { key: "coins_20", type: "coins", value: 20, short: "20", label: "20 เหรียญ", tone: "dark" },
  { key: "retry_b", type: "none", value: 0, short: "ลองใหม่", label: "ลองใหม่อีกครั้ง", tone: "dim" },
  { key: "coins_10_b", type: "coins", value: 10, short: "10", label: "10 เหรียญ", tone: "navy" },
  { key: "coins_50", type: "coins", value: 50, short: "50", label: "50 เหรียญ", tone: "gold" },
  { key: "free_reading", type: "free_reading", value: 1, short: "ดูดวงฟรี", label: "สิทธิ์ดูดวงฟรี 1 ครั้ง", tone: "dark" },
  { key: "jackpot_5000", type: "coins", value: 5000, short: "5,000", label: "แจ็กพอตใหญ่ 5,000 เหรียญ", tone: "jackpot" },
];

export type SpinResponse = {
  segmentIndex: number;
  reward: { key: string; type: RewardType; value: number; label: string };
  balance: number;
  spinTickets: number;
  freeReadingTickets: number;
  /** True when this spin cost coins instead of a free ticket. */
  paid: boolean;
  /** Coins charged for this spin (0 for a free-ticket spin). */
  cost: number;
};

export type CheckinResponse = { granted: boolean; spinTickets: number };
