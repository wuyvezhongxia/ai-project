/**
 * DeepSeek 使用 OpenAI 兼容的 chat/completions；stream:true 时响应体为 SSE，
 * 每行 data: { JSON }，choices[0].delta.content 为增量 token。
 * 此处只做「读流 + 拆事件 + 回调 token」，不涉及业务 pending / 路由。
 */

export async function consumeOpenAiCompatibleSseTokens(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onToken: (token: string) => Promise<void> | void,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed: { choices?: Array<{ delta?: { content?: string } }> } | null = null;
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = null;
      }
      if (!parsed) continue;

      const token = parsed.choices?.[0]?.delta?.content ?? "";
      if (!token) continue;
      output += token;
      await onToken(token);
    }
  }

  return output;
}
