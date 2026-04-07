import { env } from "../../../config/env";

/** OpenAI 兼容的 DeepSeek Chat Completions 端点 */
export function deepSeekChatCompletionsUrl(): string {
  return `${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`;
}

export function assertDeepSeekApiKey(): void {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("未配置 DEEPSEEK_API_KEY");
  }
}

export function deepSeekJsonHeaders(): Record<string, string> {
  assertDeepSeekApiKey();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
  };
}

/**
 * POST /chat/completions（与现有各模块相同的 URL/Headers 约定）。
 */
export async function postDeepSeekChatCompletions(
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  assertDeepSeekApiKey();
  return fetch(deepSeekChatCompletionsUrl(), {
    method: "POST",
    headers: deepSeekJsonHeaders(),
    body: JSON.stringify(body),
    signal: init?.signal,
  });
}
