/**
 * Coin top-up packages — the single source of truth for both the /topup page and
 * the server's slip check. The server always looks the package up here by id;
 * prices and coin amounts are never taken from the request.
 */

type PackageDef = {
  id: string;
  name: string;
  priceThb: number;
  /** Total coins credited (1 coin per baht + bonus). */
  coins: number;
  badge?: string;
  note: string;
};

const PACKAGE_DEFS = [
  {
    id: "pkg_50",
    name: "แพ็กเกจเริ่มต้น",
    priceThb: 50,
    coins: 50,
    note: "เริ่มต้นเสริมดวงแบบสบายๆ",
  },
  {
    id: "pkg_99",
    name: "แพ็กเกจเปิดไพ่",
    priceThb: 99,
    coins: 100,
    note: "เปิดไพ่ยิปซีได้ 1 ครั้ง",
  },
  {
    id: "pkg_199",
    name: "แพ็กเกจสุดคุ้ม",
    priceThb: 199,
    coins: 210,
    badge: "สุดคุ้ม",
    note: "ดูดวงวันเดือนปีเกิดได้ 1 ครั้ง หรือเปิดไพ่ได้ 2 ครั้ง",
  },
  {
    id: "pkg_299",
    name: "แพ็กเกจสายมูจัดเต็ม",
    priceThb: 299,
    coins: 330,
    badge: "จัดเต็ม",
    note: "ดูได้ครบทั้ง 2 ศาสตร์ พร้อมเหรียญโบนัส",
  },
  {
    id: "pkg_499",
    name: "แพ็กเกจเจ้าสัวสายมู",
    priceThb: 499,
    coins: 540,
    badge: "โบนัสจุกๆ",
    note: "ดูดวงจัดเต็มทุกศาสตร์ พร้อมรับเหรียญโบนัสเพิ่ม 41 เหรียญ",
  },
  {
    id: "pkg_999",
    name: "แพ็กเกจมหาเศรษฐี ณ มัณตรา",
    priceThb: 999,
    coins: 1050,
    badge: "VIP คุ้มที่สุด",
    note: "เปิดดวงชะตาแบบ VIP ไม่จำกัด พร้อมรับเหรียญโบนัสสูงสุด 51 เหรียญ",
  },
] as const satisfies readonly PackageDef[];

/** Union of every package id, derived from PACKAGE_DEFS — adding an entry there is the only change needed. */
export type PackageId = (typeof PACKAGE_DEFS)[number]["id"];

export type TopupPackage = Omit<PackageDef, "id"> & { id: PackageId };

export const PACKAGES: readonly TopupPackage[] = PACKAGE_DEFS;

export function findPackage(id: string): TopupPackage | undefined {
  return PACKAGES.find((p) => p.id === id);
}

/** Bonus coins on top of 1 coin per baht. */
export function bonusCoins(p: TopupPackage): number {
  return Math.max(0, p.coins - p.priceThb);
}
