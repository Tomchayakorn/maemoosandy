import "server-only";

/**
 * Push a text message to the admin through the LINE Messaging API.
 * Never throws: missing keys or a LINE outage must not break the caller.
 */
export async function notifyAdminLine(text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ADMIN_USER_ID;
  if (!token || !to) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("LINE push failed", res.status);
    return res.ok;
  } catch (e) {
    console.error("LINE push error", e);
    return false;
  }
}
