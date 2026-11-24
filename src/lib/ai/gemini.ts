import "server-only";

import { GoogleGenAI } from "@google/genai";
import { tidyReading } from "./tidy";

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_FALLBACKS = ["gemini-3.7-flash", "gemini-3.6-flash"];
/** Overload / transient statuses worth trying the next model for. */
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);
const PER_MODEL_TIMEOUT_MS = 25_000;

let client: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({
    apiKey,
    // We fall back across models ourselves, so no SDK-level retries.
    httpOptions: { timeout: PER_MODEL_TIMEOUT_MS, retryOptions: { attempts: 1 } },
  });
  return client;
}

/** GEMINI_MODEL first, then GEMINI_FALLBACK_MODELS (comma-separated) or the defaults. */
function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbacks = process.env.GEMINI_FALLBACK_MODELS
    ? process.env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : DEFAULT_FALLBACKS;
  return [...new Set([primary, ...fallbacks])];
}

/**
 * Generate a reading in Mae Mu Sandy's voice. When a model is overloaded or
 * times out, the next model in the chain is tried. Throws if all fail.
 */
export async function generateReadingGemini({ system, prompt }: { system: string; prompt: string }): Promise<string> {
  let lastError: unknown;

  for (const model of modelChain()) {
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, temperature: 0.9, maxOutputTokens: 6144 },
      });
      const text = response.text?.trim();
      if (!text) throw new Error(`${model} returned an empty response`);
      return tidyReading(text);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      // A definite client error (bad key, bad request) won't be fixed by another model.
      if (status !== undefined && !RETRYABLE_STATUS.has(status)) throw err;
      console.warn(`gemini: ${model} failed (${status ?? (err as Error).message}), trying next model`);
    }
  }

  throw lastError;
}
