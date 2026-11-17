import "server-only";

import { generateReadingClaude, isClaudeConfigured } from "./claude";
import { generateReadingGemini, isGeminiConfigured } from "./gemini";

/** Which AI writes the readings. AI_PROVIDER=gemini switches back to Gemini; anything else uses Claude. */
function provider(): "claude" | "gemini" {
  return process.env.AI_PROVIDER === "gemini" ? "gemini" : "claude";
}

export function isAiConfigured(): boolean {
  return provider() === "gemini" ? isGeminiConfigured() : isClaudeConfigured();
}

/** Generate a reading with the configured provider. Throws on failure — callers must refund. */
export function generateReading(args: { system: string; prompt: string }): Promise<string> {
  return provider() === "gemini" ? generateReadingGemini(args) : generateReadingClaude(args);
}
