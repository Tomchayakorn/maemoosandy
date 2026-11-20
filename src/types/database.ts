/**
 * Database types for supabase/migrations/0001_init.sql.
 * Hand-written in the `supabase gen types typescript` format — once the project
 * is linked, regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamp = string;

export type TransactionStatus = "pending" | "success" | "failed" | "rejected";
export type WithdrawalStatus = "pending" | "approved" | "rejected";
export type FortuneType = "tarot" | "birthdate";
export type RewardType = "coins" | "free_reading" | "luck_card" | "none";
export type LedgerReason =
  | "tarot"
  | "birthdate"
  | "topup"
  | "spin"
  | "checkin"
  | "refund"
  | "admin"
  | "withdrawal"
  | "withdrawal_refund";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          user_id: string;
          balance: number;
          spin_tickets: number;
          free_reading_tickets: number;
          jackpot_withdrawals_available: number;
          /** Accumulated bonus coins won in "ดวงดี มีเฮ" (migration 0007); only an approved bonus withdrawal subtracts 1,000. */
          lucky_card_bonus_total: number;
          /** Consecutive rounds without a bonus/secret (migration 0008); drives the bonus guarantee. */
          lucky_card_dry_rounds: number;
          /** "การ์ด +ความเฮง" held (migration 0010) */
          luck_cards: number;
          /** rounds left on the +ความเฮง buff */
          luck_buff_rounds: number;
          /** "ยอดสะสมจากการหมุนเกม" (migration 0013): tally of 25% of coin prizes won on paid spins; a withdrawal ticket, not wallet coins */
          wheel_cash_total: number;
          /** spins left in the "มือขึ้น 5 ตาติด" hot streak (migration 0014) */
          hot_streak_rounds: number;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          user_id: string;
          balance?: number;
          spin_tickets?: number;
          free_reading_tickets?: number;
          jackpot_withdrawals_available?: number;
          lucky_card_bonus_total?: number;
          lucky_card_dry_rounds?: number;
          luck_cards?: number;
          luck_buff_rounds?: number;
          wheel_cash_total?: number;
          hot_streak_rounds?: number;
        };
        Update: {
          balance?: number;
          spin_tickets?: number;
          free_reading_tickets?: number;
          jackpot_withdrawals_available?: number;
          lucky_card_bonus_total?: number;
          luck_cards?: number;
          luck_buff_rounds?: number;
          wheel_cash_total?: number;
          hot_streak_rounds?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          package_id: string;
          amount_thb: number;
          coins_added: number;
          status: TransactionStatus;
          provider: string | null;
          charge_id: string | null;
          slip_ref: string | null;
          slip_path: string | null;
          failure_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          package_id: string;
          amount_thb: number;
          coins_added?: number;
          status?: TransactionStatus;
          provider?: string | null;
          charge_id?: string | null;
          slip_ref?: string | null;
          slip_path?: string | null;
          failure_reason?: string | null;
        };
        Update: {
          status?: TransactionStatus;
          provider?: string | null;
          charge_id?: string | null;
          slip_ref?: string | null;
          slip_path?: string | null;
          failure_reason?: string | null;
        };
        Relationships: [];
      };
      wallet_ledger: {
        Row: {
          id: string;
          user_id: string;
          reason: LedgerReason;
          coins_delta: number;
          spin_tickets_delta: number;
          free_reading_tickets_delta: number;
          ref_id: string | null;
          refunded_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fortune_logs: {
        Row: {
          id: string;
          user_id: string;
          fortune_type: FortuneType;
          question: string | null;
          input: Json;
          result_text: string;
          coins_spent: number;
          used_free_ticket: boolean;
          ledger_id: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          fortune_type: FortuneType;
          question?: string | null;
          input?: Json;
          result_text: string;
          coins_spent?: number;
          used_free_ticket?: boolean;
          ledger_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      spin_logs: {
        Row: {
          id: string;
          user_id: string;
          reward_key: string;
          reward_type: RewardType;
          reward_value: number;
          paid_spin_number: number | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      daily_checkins: {
        Row: {
          user_id: string;
          checkin_date: string;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      withdrawal_requests: {
        Row: {
          id: string;
          user_id: string;
          amount_coins: number;
          amount_thb: number;
          bank_name: string;
          account_number: string;
          account_name: string;
          status: WithdrawalStatus;
          ledger_id: string | null;
          source: "jackpot" | "lucky_card" | "lucky_card_bonus" | "wheel_cash";
          prize_id: string | null;
          /** true while a lucky_card_bonus request holds 1,000 reserved coins (migration 0009) */
          bonus_reserved: boolean;
          reviewed_by: string | null;
          reviewed_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lucky_card_plays: {
        Row: {
          id: string;
          user_id: string;
          card_index: number;
          result_kind: "message" | "bonus" | "secret";
          message_id: string | null;
          bonus_coins: number;
          prize_id: string | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lucky_card_prizes: {
        Row: {
          id: string;
          user_id: string;
          play_id: string | null;
          amount_thb: number;
          status: "pending" | "withdrawn";
          withdrawal_request_id: string | null;
          created_at: Timestamp;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      spend_coins: {
        Args: { p_user_id: string; p_amount: number; p_reason: FortuneType };
        Returns: Json; // { ledger_id, balance }
      };
      use_free_reading_ticket: {
        Args: { p_user_id: string; p_reason: FortuneType };
        Returns: Json; // { ledger_id, free_reading_tickets }
      };
      refund_coins: {
        Args: { p_ledger_id: string };
        Returns: Json; // { refunded, balance?, free_reading_tickets?, already_refunded? }
      };
      credit_topup: {
        Args: {
          p_user_id: string;
          p_package_id: string;
          p_amount_thb: number;
          p_coins: number;
          p_slip_ref: string;
          p_slip_path: string;
          p_provider: string;
          p_charge_id: string;
        };
        Returns: Json; // { transaction_id, coins_added, balance, already_credited }
      };
      spin_wheel: {
        Args: {
          p_user_id: string;
          p_reward_key: string;
          p_reward_type: RewardType;
          p_reward_value: number;
        };
        Returns: Json; // { spin_log_id, balance, spin_tickets, free_reading_tickets }
      };
      spin_wheel_any: {
        Args: {
          p_user_id: string;
          p_reward_key: string;
          p_reward_type: RewardType;
          p_reward_value: number;
          p_cost: number;
        };
        Returns: Json; // { spin_log_id, paid, balance, spin_tickets, free_reading_tickets }
      };
      spin_wheel_cycle: {
        Args: {
          p_user_id: string;
          p_cost: number;
          p_jackpot_every: number;
          p_reward_key: string;
          p_reward_type: RewardType;
          p_reward_value: number;
          p_jackpot_key: string;
          p_jackpot_type: RewardType;
          p_jackpot_value: number;
          p_buff_reward_key?: string;
          p_buff_reward_type?: RewardType;
          p_buff_reward_value?: number;
          p_cash_pct?: number;
          p_hot_trigger?: boolean;
          p_hot_reward_key?: string;
          p_hot_reward_type?: RewardType;
          p_hot_reward_value?: number;
          p_hot_rounds?: number;
        };
        Returns: Json; // { spin_log_id, paid, jackpot, paid_spin_number, reward_key, balance, spin_tickets, free_reading_tickets }
      };
      request_wheel_cash_withdrawal: {
        Args: {
          p_user_id: string;
          p_tier: number;
          p_bank_name: string;
          p_account_number: string;
          p_account_name: string;
          p_daily_limit: number;
          p_weekly_limit: number;
        };
        Returns: Json; // { request_id, amount_thb, wheel_cash_total, already_pending }
      };
      use_luck_card: {
        Args: { p_user_id: string; p_rounds?: number; p_min_balance?: number };
        Returns: Json; // { luck_cards, luck_buff_rounds }
      };
      request_jackpot_withdrawal: {
        Args: { p_user_id: string; p_bank_name: string; p_account_number: string; p_account_name: string };
        Returns: Json; // { request_id, balance, jackpot_withdrawals_available }
      };
      review_jackpot_withdrawal: {
        Args: { p_request_id: string; p_approve: boolean; p_reviewer: string };
        Returns: Json; // { status }
      };
      play_lucky_card: {
        Args: {
          p_user_id: string;
          p_cost: number;
          p_card_index: number;
          p_kind: "message" | "bonus" | "secret";
          p_message_id: string | null;
          p_bonus_coins: number;
          p_prize_thb: number;
          p_pity_after?: number;
          p_pity_bonus?: number;
        };
        Returns: Json; // { play_id, balance, prize_id, bonus_total, kind, bonus_coins, message_id, guaranteed, dry_rounds }
      };
      request_lucky_card_bonus_withdrawal: {
        Args: { p_user_id: string; p_bank_name: string; p_account_number: string; p_account_name: string };
        Returns: Json; // { request_id, amount_thb, bonus_total, already_pending }
      };
      request_lucky_card_withdrawal: {
        Args: { p_user_id: string; p_prize_id: string; p_bank_name: string; p_account_number: string; p_account_name: string };
        Returns: Json; // { request_id, amount_thb }
      };
      daily_checkin: {
        Args: { p_user_id: string };
        Returns: Json; // { granted, spin_tickets, checkin_date }
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Wallet = Tables<"wallets">;
export type Profile = Tables<"profiles">;
export type Transaction = Tables<"transactions">;
export type FortuneLog = Tables<"fortune_logs">;
export type SpinLog = Tables<"spin_logs">;

/** Error codes raised by the RPCs (in the Postgres error message). */
export const RPC_ERRORS = [
  "INSUFFICIENT_COINS",
  "NO_FREE_READING_TICKETS",
  "NO_SPIN_TICKETS",
  "WALLET_NOT_FOUND",
  "SLIP_ALREADY_USED",
  "MISSING_SLIP_REF",
  "INVALID_AMOUNT",
  "INVALID_REASON",
  "INVALID_REWARD",
  "LEDGER_NOT_FOUND",
  "NOT_REFUNDABLE",
  "NO_WITHDRAWAL_QUOTA",
  "WITHDRAWAL_NOT_FOUND",
  "WITHDRAWAL_ALREADY_REVIEWED",
  "PRIZE_NOT_FOUND",
  "PRIZE_ALREADY_WITHDRAWN",
  "INVALID_OUTCOME",
  "INVALID_CARD",
  "INVALID_COST",
  "BONUS_NOT_ENOUGH",
  "NO_LUCK_CARDS",
  "BUFF_ALREADY_ACTIVE",
  "WHEEL_CASH_NOT_ENOUGH",
  "WHEEL_CASH_DAILY_LIMIT",
  "WHEEL_CASH_WEEKLY_LIMIT",
  "INVALID_TIER",
] as const;
export type RpcErrorCode = (typeof RPC_ERRORS)[number];

export function parseRpcError(message: string | undefined): RpcErrorCode | null {
  if (!message) return null;
  return RPC_ERRORS.find((code) => message.includes(code)) ?? null;
}
