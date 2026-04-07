import { env } from "../../../config/env";
import type { AiMetadata } from "./ai.types";

export const buildMeta = (start: number, patch?: Partial<AiMetadata>): AiMetadata => ({
  model: patch?.model ?? (env.DEEPSEEK_MODEL || "rule-based"),
  tokensUsed: patch?.tokensUsed ?? 0,
  responseTime: patch?.responseTime ?? Date.now() - start,
});

export const hasRealLlm = () => Boolean(env.DEEPSEEK_API_KEY);

/** 结构化 JSON 路由（替代用户输入正则门闸）；需 API Key 且未显式关闭 */
export const isStructuredRoutingEnabled = () =>
  Boolean(env.DEEPSEEK_API_KEY) && env.AI_STRUCTURED_ROUTING_ENABLED;
