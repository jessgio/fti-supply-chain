import crypto from "crypto";

export interface LarkConfig {
  webhookUrl: string;
  secret: string;
}

export interface LarkSendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export function getLarkConfig(): LarkConfig | null {
  const webhookUrl = process.env.LARK_WEBHOOK_URL?.trim();
  const secret = process.env.LARK_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) return null;
  return { webhookUrl, secret };
}

/** Feishu/Lark custom bot sign: HMAC-SHA256 key = `${timestamp}\n${secret}`, empty message. */
export function signLarkWebhook(timestamp: string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

export async function sendLarkPayload(
  payload: Record<string, unknown>,
  config: LarkConfig = getLarkConfig()!,
): Promise<LarkSendResult> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = signLarkWebhook(timestamp, config.secret);

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ timestamp, sign, ...payload }),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }

  return { ok: response.ok, status: response.status, body };
}
