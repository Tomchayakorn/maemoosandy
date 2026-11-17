/**
 * Thai name numerology (เลขศาสตร์) using the widely published letter table.
 * Every consonant, vowel sign and tone mark carries a value; the name's power
 * is the plain (unreduced) sum, e.g. ผลรวม 45.
 */

const THAI_TABLE: Record<number, string> = {
  1: "กดถทภฤาำุ่",
  2: "ขฃชงบปเแู้",
  3: "ฆตฑฒ๋",
  4: "คฅธญรษะโัิ",
  5: "ฉฌณนมหฎฮฬึ",
  6: "จลวอใ",
  7: "ซศสีื๊",
  8: "ยผฝพฟ็",
  9: "ฏฐไ์",
};

// Thai numerology convention for Latin letters (used when a name is written in English).
const LATIN_TABLE: Record<number, string> = {
  1: "AIJQY",
  2: "BKR",
  3: "CGLS",
  4: "DMT",
  5: "EHNX",
  6: "UVW",
  7: "OZ",
  8: "FP",
};

const VALUE = new Map<string, number>();
for (const [n, chars] of Object.entries(THAI_TABLE)) for (const ch of chars) VALUE.set(ch, Number(n));
for (const [n, chars] of Object.entries(LATIN_TABLE)) for (const ch of chars) VALUE.set(ch, Number(n));

/** Value of a single character, or null if it doesn't count (space, punctuation, digit). */
export function letterValue(ch: string): number | null {
  return VALUE.get(ch.toUpperCase()) ?? null;
}

export type NumerologyBreakdown = {
  total: number;
  letters: Array<{ char: string; value: number }>;
};

export function sumName(text: string): NumerologyBreakdown {
  const letters: NumerologyBreakdown["letters"] = [];
  for (const ch of text.normalize("NFC")) {
    const v = letterValue(ch);
    if (v !== null) letters.push({ char: ch, value: v });
  }
  return { total: letters.reduce((s, l) => s + l.value, 0), letters };
}

export type NameNumerology = { first: number; last: number; total: number };

export function nameNumerology(firstName: string, lastName: string): NameNumerology {
  const first = sumName(firstName).total;
  const last = sumName(lastName).total;
  return { first, last, total: first + last };
}

/** Repeatedly add digits until one digit remains (e.g. 45 → 9). */
export function digitRoot(n: number): number {
  let x = Math.abs(n);
  while (x > 9) x = String(x).split("").reduce((s, d) => s + Number(d), 0);
  return x;
}
