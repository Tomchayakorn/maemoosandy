import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { tidyReading } from "./tidy";

const DEFAULT_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the environment.
  // The SDK retries 429/5xx/connection errors itself; one retry keeps us inside the route's maxDuration.
  client ??= new Anthropic({ timeout: 75_000, maxRetries: 1 });
  return client;
}

/** Generate a reading in Mae Mu Sandy's voice with Claude. Throws on any failure so the caller refunds. */
export async function generateReadingClaude({ system, prompt }: { system: string; prompt: string }): Promise<string> {
  const stream = getClient().beta.messages.stream({
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    max_tokens: 64000,
    // Thinking is always on for Claude Opus 5.5; effort sets its depth (default "medium", set explicitly).
    output_config: { effort: "medium" },
    // If a safety classifier declines, the API retries on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined the reading (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude reading was cut off at max_tokens");
  }

  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude returned an empty reading");
  return tidyReading(text);
}
