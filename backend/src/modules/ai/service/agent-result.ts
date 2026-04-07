import { env } from "../../../config/env";
import type { AiResponse } from "../core/ai.types";
import { buildMeta } from "../core/ai.meta";

export function agentResultToAiResponse(agentResult: any, startedAt: number): AiResponse {
  return {
    success: agentResult.success,
    output: agentResult.output || "",
    suggestions: agentResult.suggestions,
    requiresConfirmation: agentResult.requiresConfirmation,
    confirmationData: agentResult.confirmationData,
    metadata: buildMeta(startedAt, {
      model: agentResult.model || env.DEEPSEEK_MODEL,
      tokensUsed: agentResult.tokensUsed || 0,
    }),
    error: agentResult.error,
  };
}
