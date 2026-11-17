/**
 * Prepares Mae Mu Sandy's reading text for a Thai speech engine.
 *
 * Thai is written without sentence punctuation and uses spaces as clause and
 * sentence breaks, so device voices tend to run everything together. We:
 *  - drop markup and English glosses ("ดวงดาว (The Star)" → "ดวงดาว"),
 *  - expand symbols a voice reads badly (ๆ, ฯลฯ, ·, —, long digit runs),
 *  - split at spaces into short phrases; the gap between utterances becomes a
 *    natural breath pause, and headings get their own utterance.
 * Pure functions: no DOM, safe to unit test.
 */

export type SpeechPhrase = { text: string; kind: "heading" | "body" };

const MIN_PHRASE = 14; // merge shorter fragments so speech isn't choppy
const MAX_PHRASE = 140; // keep utterances short (Chrome stalls on long ones)

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;

/** "ดีๆ" → "ดี ดี", "ค่อยๆ เป็น" → "ค่อย ค่อย เป็น" (repeat the preceding word). */
export function expandMaiYamok(text: string): string {
  if (!text.includes("ๆ")) return text;
  if (!segmenter) return text.replace(/\s*ๆ/g, "");
  const words = Array.from(segmenter.segment(text), (s) => s.segment);
  const out: string[] = [];
  let lastWord = "";
  for (const w of words) {
    const t = w.trim();
    if (t === "ๆ") {
      // Segmenter returned ๆ on its own: repeat the previous word.
      if (lastWord) out.push(" ", lastWord);
      continue;
    }
    if (t.endsWith("ๆ")) {
      // Segmenter kept ๆ attached ("ค่อยๆ"): repeat the word itself.
      const base = t.replace(/\s*ๆ+$/, "");
      out.push(`${base} ${base}`);
      lastWord = base;
      continue;
    }
    if (t) lastWord = t;
    out.push(w);
  }
  return out.join("");
}

/** Normalise one line of reading text for speech. */
export function normalizeForSpeech(line: string): string {
  let s = line
    .replace(/^##\s+/, "")
    .replace(/^-\s+/, "")
    // English glosses in parentheses, e.g. "(The Star)", "(Three of Cups)"
    .replace(/\s*\([A-Za-z][^)]*\)/g, "")
    .replace(/ฯลฯ/g, " และอื่น อื่น ")
    // "ไพ่กลับหัว" stays; punctuation/symbols become pauses (spaces)
    .replace(/[·•—–|/]/g, " ")
    .replace(/[“”"'‘’]/g, "")
    .replace(/[:;]/g, " ")
    // Hotline / long numbers read digit by digit: "1323" → "1 3 2 3"
    .replace(/\d{4,}/g, (d) => d.split("").join(" "))
    // Thai ending particles sound better with a tiny break after them before the next clause
    // (bare "คะ" is left alone: it starts ordinary words such as "คะแนน")
    .replace(/(นะคะ|ค่ะ|ครับ)(?=\S)/g, "$1 ");
  s = expandMaiYamok(s);
  return s.replace(/\s+/g, " ").trim();
}

/** Split a normalised line into phrases at spaces, merging tiny fragments. */
function splitPhrases(line: string): string[] {
  // Thai puts spaces around numbers ("ช่วง 3 เดือน"); those aren't pauses, so keep numbers glued to their neighbours.
  const parts: string[] = [];
  for (const token of line.split(" ").filter(Boolean)) {
    const prev = parts[parts.length - 1];
    if (prev !== undefined && (/^\d/.test(token) || /\d$/.test(prev))) parts[parts.length - 1] = `${prev} ${token}`;
    else parts.push(token);
  }
  const phrases: string[] = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    if (current && candidate.length > MAX_PHRASE) {
      phrases.push(current);
      current = part;
    } else if (candidate.length < MIN_PHRASE) {
      current = candidate;
    } else {
      phrases.push(candidate);
      current = "";
    }
  }
  if (current) {
    // Attach a short tail to the previous phrase instead of speaking it alone.
    if (phrases.length && current.length < MIN_PHRASE && (phrases[phrases.length - 1] + " " + current).length <= MAX_PHRASE) {
      phrases[phrases.length - 1] += ` ${current}`;
    } else {
      phrases.push(current);
    }
  }
  return phrases;
}

/** Reading markup → ordered phrases for the speech queue. */
export function toSpeechPhrases(reading: string): SpeechPhrase[] {
  const out: SpeechPhrase[] = [];
  for (const raw of reading.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const kind = trimmed.startsWith("## ") ? "heading" : "body";
    const text = normalizeForSpeech(trimmed);
    if (!text) continue;
    if (kind === "heading") out.push({ text, kind });
    else for (const p of splitPhrases(text)) out.push({ text: p, kind });
  }
  return out;
}
