import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

/**
 * OpenAI-compatible provider. Works with a native OpenAI key, or with an
 * OpenAI-compatible gateway (e.g. OpenRouter) via OPENAI_BASE_URL. An OpenRouter
 * key (sk-or-*) auto-targets https://openrouter.ai/api/v1 when no base URL is set.
 */
export function isOpenRouter(): boolean {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const baseURL = process.env.OPENAI_BASE_URL ?? "";
  return apiKey.startsWith("sk-or-") || baseURL.includes("openrouter");
}

export function getOpenAIProvider(): OpenAIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const explicitBase = process.env.OPENAI_BASE_URL;
  const baseURL =
    explicitBase ||
    (apiKey.startsWith("sk-or-") ? "https://openrouter.ai/api/v1" : undefined);

  return createOpenAI({ apiKey, baseURL });
}

/**
 * Normalize a bare OpenAI model id (e.g. "gpt-4o") to the gateway's namespaced
 * form (e.g. "openai/gpt-4o") when routing through OpenRouter.
 */
export function resolveModelId(model: string): string {
  if (isOpenRouter() && !model.includes("/")) {
    return `openai/${model}`;
  }
  return model;
}
