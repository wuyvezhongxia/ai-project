import type { AuthContext } from "../../../common/types";
import { env } from "../../../config/env";
import { postDeepSeekChatCompletions } from "../service/deepseek-api";
import { chatSchema } from "../core/ai.schemas";
import type { ChatParams } from "../core/ai.schemas";
import type { AiResponse } from "../core/ai.types";
import { buildMeta, hasRealLlm, isStructuredRoutingEnabled } from "../core/ai.meta";
import { hasUnverifiedCreateClaim, isLikelyStructuredFieldsText, isPredefinedOperationText } from "../core/ai.intent-parsing";
import { buildModelMessagesForChat } from "../service/llm-messages";
import { looksLikeOperationCommand, parseOperationIntentWithLlm } from "../service/llm-operation-intent";
import { applyBatchAdjustRouteOverride } from "../service/structured-router/batch-adjust-route";
import { buildSkillCatalogLines, fetchStructuredRouterResult } from "../service/structured-router";
import type { StructuredRouterResult } from "../service/structured-router";
import { getSkillRouterAgent } from "../skills/skill.router";
import { consumeOpenAiCompatibleSseTokens } from "./deepseek-sse";

type PendingBundle = {
  pendingTaskCreateMap: Map<string, unknown>;
  pendingProjectCreateMap: Map<string, unknown>;
  pendingSubtaskCreateMap: Map<string, unknown>;
  pendingDeleteTaskBatchMap: Map<string, unknown>;
  pendingConfirmActionMap: Map<string, unknown>;
  pendingInferredActionMap: Map<string, unknown>;
  pendingStructuredInputMap: Map<string, unknown>;
  pendingTaskDisambiguationMap: Map<string, unknown>;
  pendingTaskModifyTargetMap: Map<string, unknown>;
};

const PENDING_MODIFY_TTL_MS = 10 * 60 * 1000;

function isAlivePendingModify(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const at = (entry as { requestedAt?: number }).requestedAt;
  return typeof at === "number" && Date.now() - at <= PENDING_MODIFY_TTL_MS;
}

function hasAnyPending(ctx: AuthContext, keyFn: (c: AuthContext) => string, b: PendingBundle): boolean {
  const k = keyFn(ctx);
  return (
    b.pendingTaskCreateMap.has(k) ||
    b.pendingProjectCreateMap.has(k) ||
    b.pendingSubtaskCreateMap.has(k) ||
    b.pendingDeleteTaskBatchMap.has(k) ||
    b.pendingConfirmActionMap.has(k) ||
    b.pendingInferredActionMap.has(k) ||
    b.pendingStructuredInputMap.has(k) ||
    b.pendingTaskDisambiguationMap.has(k) ||
    (b.pendingTaskModifyTargetMap.has(k) && isAlivePendingModify(b.pendingTaskModifyTargetMap.get(k)))
  );
}

/**
 * 主对话流式入口：先判断是否应走确定性 chat 链路，再对 DeepSeek 发起 stream 请求并解析 SSE。
 */
export async function runStreamChat(opts: {
  params: ChatParams;
  ctx: AuthContext;
  onToken: (token: string) => Promise<void> | void;
  pendingKey: (c: AuthContext) => string;
  pending: PendingBundle;
  /** 与 chat() 内 fetchStructuredRouterResult 一致：注入 [PENDING_STATE]，无 pending 时为 null */
  getStructuredRouterPendingContext?: (params: ChatParams, ctx: AuthContext) => string | null;
  fallbackChat: (
    params: ChatParams,
    ctx: AuthContext,
    opts?: {
      llmCanonicalOperation?: string;
      structuredResolution?: StructuredRouterResult;
      structuredRoutingFailed?: boolean;
    },
  ) => Promise<AiResponse>;
}): Promise<AiResponse> {
  const { params, ctx, onToken, pendingKey, pending, getStructuredRouterPendingContext, fallbackChat } = opts;
  try {
    const startedAt = Date.now();
    const input = chatSchema.parse(params);
    const streamQuestion = input.inputText.trim();

    if (hasAnyPending(ctx, pendingKey, pending) || isLikelyStructuredFieldsText(streamQuestion)) {
      return fallbackChat(params, ctx);
    }

    if (isStructuredRoutingEnabled() && hasRealLlm() && env.DEEPSEEK_API_KEY) {
      const sr = getSkillRouterAgent();
      const catalog = buildSkillCatalogLines(
        sr
          .getSkillRegistry()
          .getEnabledSkills()
          .map((s) => ({ id: s.id, name: s.name, description: s.description })),
      );
      const routed = await fetchStructuredRouterResult(streamQuestion, {
        bizId: input.bizId,
        skillCatalog: catalog,
        pendingContextBlock: getStructuredRouterPendingContext?.(params, ctx) ?? null,
      });
      if (routed === null) {
        return fallbackChat(params, ctx, { structuredRoutingFailed: true });
      }
      const effectiveRoute = applyBatchAdjustRouteOverride(streamQuestion, input.bizId, routed);
      if (effectiveRoute.route === "operation" || effectiveRoute.route === "skill") {
        return fallbackChat(params, ctx, { structuredResolution: effectiveRoute });
      }
    } else {
      if (isPredefinedOperationText(streamQuestion)) {
        return fallbackChat(params, ctx);
      }
      if (hasRealLlm() && env.DEEPSEEK_API_KEY) {
        const llmOp = await parseOperationIntentWithLlm(streamQuestion);
        const cmd = llmOp?.canonical_command?.trim();
        if (llmOp?.is_operation && cmd && looksLikeOperationCommand(cmd)) {
          return fallbackChat(params, ctx, { llmCanonicalOperation: cmd });
        }
      }
    }

    if (!hasRealLlm() || !env.DEEPSEEK_API_KEY) {
      return fallbackChat(params, ctx);
    }

    const messages = await buildModelMessagesForChat(input.inputText, ctx, input.bizId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT);

    try {
      const response = await postDeepSeekChatCompletions(
        {
          model: env.DEEPSEEK_MODEL,
          stream: true,
          messages,
          temperature: 0.3,
          max_tokens: env.AI_MAX_TOKENS_PER_REQUEST,
        },
        { signal: controller.signal },
      );

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`DeepSeek流式请求失败(${response.status}) ${errorText}`);
      }

      const output = await consumeOpenAiCompatibleSseTokens(response.body.getReader(), onToken);

      if (hasUnverifiedCreateClaim(output)) {
        return {
          success: false,
          output: "",
          error: "检测到未校验的“创建成功”回复（缺少ID），已拦截。请使用明确创建指令。",
        };
      }

      return {
        success: true,
        output,
        metadata: buildMeta(startedAt, { model: env.DEEPSEEK_MODEL }),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (/DeepSeek流式请求失败\(402\)|Insufficient\s*Balance|invalid_request_error/i.test(msg)) {
        return {
          success: false,
          output: "",
          error: "AI模型余额不足（DeepSeek 402），请充值或切换模型后重试。",
        };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "AI流式处理失败",
    };
  }
}
