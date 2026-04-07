import { toDbId } from "../../common/db-values";
import type { AuthContext } from "../../common/types";
import { env } from "../../config/env";
import { getSkillRouterAgent } from "./skills/skill.router";

import { chatSchema } from "./core/ai.schemas";
import type { ChatParams, SkillParams } from "./core/ai.schemas";
import type {
  AiResponse,
  CreateTaskDraft,
  PendingConfirmAction,
  PendingDeleteTaskBatch,
  PendingInferredAction,
  PendingProjectCreate,
  PendingStructuredInput,
  PendingSubtaskCreate,
  PendingTaskCreate,
  PendingTaskDisambiguation,
  PendingTaskModifyTarget,
} from "./core/ai.types";

export type { ChatParams, SkillParams } from "./core/ai.schemas";
export type { AiResponse } from "./core/ai.types";

import { isNumericId } from "./core/ai.domain-format";
import { buildMeta, hasRealLlm, isStructuredRoutingEnabled } from "./core/ai.meta";
import { isPredefinedOperationText } from "./core/ai.intent-parsing";

import type { AiChatHost, ChatTurnState } from "./chat/chat-host";
import { runChatPendingPhases, runExplicitOperationsPhase, runStructuredGuardPhase } from "./chat";

import { agentResultToAiResponse } from "./service/agent-result";
import { buildAiChatContext } from "./service/chat-context";
import { runConfirmActionSwitch } from "./service/confirm-action";
import {
  buildConversationMessagesForChat,
  buildModelMessagesForChat,
  callDeepSeekChatNonStreaming,
} from "./service/llm-messages";
import { aiPendingKey } from "./service/pending-keys";
import { createProjectByNameOp, createTaskFromDraftOp, resolveProjectForTask } from "./service/project-task-ops";
import {
  runBatchAdjustPreview,
  runBreakdownTask,
  runGenerateTaskInsight,
  runGenerateWeeklyReport,
} from "./service/skill-handlers";
import { maybeApplyLlmExplicitOperationAugmentation } from "./service/llm-operation-intent";
import { applyBatchAdjustRouteOverride } from "./service/structured-router/batch-adjust-route";
import {
  STRUCTURED_ROUTING_CLARIFY_MESSAGE,
  buildPendingContextBlock,
  buildSkillCatalogLines,
  executeStructuredRouterResult,
  fetchStructuredRouterResult,
} from "./service/structured-router";
import type { StructuredRouterResult } from "./service/structured-router";
import { runStreamChat } from "./streaming";

export class AiService {
  private readonly pendingTaskCreateMap = new Map<string, PendingTaskCreate>();
  private readonly pendingProjectCreateMap = new Map<string, PendingProjectCreate>();
  private readonly pendingSubtaskCreateMap = new Map<string, PendingSubtaskCreate>();
  private readonly pendingDeleteTaskBatchMap = new Map<string, PendingDeleteTaskBatch>();
  private readonly pendingConfirmActionMap = new Map<string, PendingConfirmAction>();
  private readonly pendingTaskModifyTargetMap = new Map<string, PendingTaskModifyTarget>();
  private readonly pendingInferredActionMap = new Map<string, PendingInferredAction>();
  private readonly pendingStructuredInputMap = new Map<string, PendingStructuredInput>();
  private readonly pendingTaskDisambiguationMap = new Map<string, PendingTaskDisambiguation>();
  private async createTaskFromDraft(
    ctx: AuthContext,
    inputBizId: string | undefined,
    draft: Pick<CreateTaskDraft, "title" | "projectName">,
    dueAt?: Date,
  ) {
    return createTaskFromDraftOp(ctx, inputBizId, draft, dueAt);
  }

  private async resolveProject(ctx: AuthContext, inputBizId?: string, projectName?: string) {
    return resolveProjectForTask(ctx, inputBizId, projectName);
  }

  private async createProjectByName(ctx: AuthContext, projectName: string) {
    return createProjectByNameOp(ctx, projectName);
  }

  private async buildChatContext(ctx: AuthContext, bizId?: string) {
    return buildAiChatContext(ctx, bizId);
  }

  private async buildConversationMessages(ctx: AuthContext, bizId?: string) {
    return buildConversationMessagesForChat(ctx, bizId);
  }

  private async buildModelMessages(inputText: string, ctx: AuthContext, bizId?: string) {
    return buildModelMessagesForChat(inputText, ctx, bizId);
  }

  private async callDeepSeekChat(inputText: string, ctx: AuthContext, bizId?: string) {
    return callDeepSeekChatNonStreaming(inputText, ctx, bizId);
  }

  async streamChat(
    params: ChatParams,
    ctx: AuthContext,
    onToken: (token: string) => Promise<void> | void,
  ): Promise<AiResponse> {
    return runStreamChat({
      params,
      ctx,
      onToken,
      pendingKey: aiPendingKey,
      pending: {
        pendingTaskCreateMap: this.pendingTaskCreateMap,
        pendingProjectCreateMap: this.pendingProjectCreateMap,
        pendingSubtaskCreateMap: this.pendingSubtaskCreateMap,
        pendingDeleteTaskBatchMap: this.pendingDeleteTaskBatchMap,
        pendingConfirmActionMap: this.pendingConfirmActionMap,
        pendingInferredActionMap: this.pendingInferredActionMap,
        pendingStructuredInputMap: this.pendingStructuredInputMap,
        pendingTaskDisambiguationMap: this.pendingTaskDisambiguationMap,
        pendingTaskModifyTargetMap: this.pendingTaskModifyTargetMap,
      },
      getStructuredRouterPendingContext: (p, c) =>
        buildPendingContextBlock(this.buildChatTurnState(p, c)),
      fallbackChat: (p, c, o) => this.chat(p, c, o),
    });
  }

  private buildAiChatHost(): AiChatHost {
    return {
      pendingTaskCreateMap: this.pendingTaskCreateMap,
      pendingProjectCreateMap: this.pendingProjectCreateMap,
      pendingSubtaskCreateMap: this.pendingSubtaskCreateMap,
      pendingDeleteTaskBatchMap: this.pendingDeleteTaskBatchMap,
      pendingConfirmActionMap: this.pendingConfirmActionMap,
      pendingTaskModifyTargetMap: this.pendingTaskModifyTargetMap,
      pendingInferredActionMap: this.pendingInferredActionMap,
      pendingStructuredInputMap: this.pendingStructuredInputMap,
      pendingTaskDisambiguationMap: this.pendingTaskDisambiguationMap,
      confirmAction: (action, params, c) => this.confirmAction(action, params, c),
      createTaskFromDraft: (c, bizId, draft, dueAt) => this.createTaskFromDraft(c, bizId, draft, dueAt),
      resolveProject: (c, bizId, name) => this.resolveProject(c, bizId, name),
      createProjectByName: (c, name) => this.createProjectByName(c, name),
      buildConversationMessages: (c, bizId) => this.buildConversationMessages(c, bizId),
      callDeepSeekChat: (text, c, bizId) => this.callDeepSeekChat(text, c, bizId),
      agentResultToAiResponse: (r, t) => agentResultToAiResponse(r, t),
    };
  }

  private buildChatTurnState(
    params: ChatParams,
    ctx: AuthContext,
    opts?: { llmCanonicalOperation?: string },
  ): ChatTurnState {
    const startedAt = Date.now();
    const input = chatSchema.parse(params);
    const raw = input.inputText.trim();
    const canonical = opts?.llmCanonicalOperation?.trim();
    const question = canonical || raw;
    const q = question.toLowerCase();
    const pendingKey = aiPendingKey(ctx);
    const pendingCreate = this.pendingTaskCreateMap.get(pendingKey);
    const pendingProjectKey = aiPendingKey(ctx);
    const pendingProjectCreate = this.pendingProjectCreateMap.get(pendingProjectKey);
    const pendingSubtaskKey = aiPendingKey(ctx);
    const pendingSubtaskCreate = this.pendingSubtaskCreateMap.get(pendingSubtaskKey);
    const pendingDeleteBatchKey = aiPendingKey(ctx);
    const pendingDeleteBatch = this.pendingDeleteTaskBatchMap.get(pendingDeleteBatchKey);
    const pendingConfirmKey = aiPendingKey(ctx);
    const pendingConfirm = this.pendingConfirmActionMap.get(pendingConfirmKey);
    const pendingModifyKey = aiPendingKey(ctx);
    const pendingModifyTarget = this.pendingTaskModifyTargetMap.get(pendingModifyKey);
    const pendingInferKey = aiPendingKey(ctx);
    const pendingInferred = this.pendingInferredActionMap.get(pendingInferKey);
    const pendingStructuredKey = aiPendingKey(ctx);
    const pendingStructured = this.pendingStructuredInputMap.get(pendingStructuredKey);
    const pendingTaskDisambiguationKey = aiPendingKey(ctx);
    const pendingTaskDisambiguation = this.pendingTaskDisambiguationMap.get(pendingTaskDisambiguationKey);
    const structured = isStructuredRoutingEnabled();
    const isExplicitOperation = structured
      ? false
      : isPredefinedOperationText(raw) || Boolean(canonical);
    const relaxExplicitOperationFailure = structured ? false : Boolean(canonical);
    const scopedProjectId = isNumericId(input.bizId) ? toDbId(input.bizId as string) : null;
    const hasAlivePendingModify =
      Boolean(pendingModifyTarget) && Date.now() - (pendingModifyTarget?.requestedAt ?? 0) <= 10 * 60 * 1000;
    if (pendingModifyTarget && !hasAlivePendingModify) {
      this.pendingTaskModifyTargetMap.delete(pendingModifyKey);
    }
    return {
      startedAt,
      input,
      question,
      q,
      ctx,
      pendingKey,
      pendingProjectKey,
      pendingSubtaskKey,
      pendingDeleteBatchKey,
      pendingConfirmKey,
      pendingModifyKey,
      pendingInferKey,
      pendingStructuredKey,
      pendingTaskDisambiguationKey,
      pendingConfirm,
      pendingDeleteBatch,
      pendingCreate,
      pendingProjectCreate,
      pendingSubtaskCreate,
      pendingStructured,
      pendingTaskDisambiguation,
      pendingInferred,
      pendingModifyTarget,
      isExplicitOperation,
      relaxExplicitOperationFailure,
      scopedProjectId,
      hasAlivePendingModify,
    };
  }

  async chat(
    params: ChatParams,
    ctx: AuthContext,
    chatOpts?: {
      llmCanonicalOperation?: string;
      structuredResolution?: StructuredRouterResult;
      /** 流式入口：路由 API 解析失败，直接澄清，不再调路由、不回退关键词 */
      structuredRoutingFailed?: boolean;
    },
  ): Promise<AiResponse> {
    try {
      const state = this.buildChatTurnState(params, ctx, chatOpts);
      const host = this.buildAiChatHost();
      const pendingResult = await runChatPendingPhases(host, state);
      if (pendingResult) return pendingResult;

      // 结构化路由开启时 isExplicitOperation 恒为 false，但「已选任务、等你改状态/优先级/截止」仍靠 explicit-modify-fields
      if (state.pendingModifyTarget && state.hasAlivePendingModify) {
        const text = state.input.inputText.trim();
        const modState: ChatTurnState = {
          ...state,
          question: text,
          q: text.toLowerCase(),
          isExplicitOperation: true,
          relaxExplicitOperationFailure: true,
        };
        const modRes = await runExplicitOperationsPhase(host, modState);
        if (modRes) return modRes;
      }

      if (isStructuredRoutingEnabled() && hasRealLlm()) {
        if (chatOpts?.structuredRoutingFailed) {
          return {
            success: true,
            output: STRUCTURED_ROUTING_CLARIFY_MESSAGE,
            metadata: buildMeta(state.startedAt),
          };
        }
        const skillRouter = getSkillRouterAgent();
        const catalog = buildSkillCatalogLines(
          skillRouter
            .getSkillRegistry()
            .getEnabledSkills()
            .map((s) => ({ id: s.id, name: s.name, description: s.description })),
        );
        const resolutionRaw =
          chatOpts?.structuredResolution ??
          (await fetchStructuredRouterResult(state.input.inputText, {
            bizId: state.input.bizId,
            skillCatalog: catalog,
            pendingContextBlock: buildPendingContextBlock(state),
          }));
        const resolution = resolutionRaw
          ? applyBatchAdjustRouteOverride(state.input.inputText, state.input.bizId, resolutionRaw)
          : null;
        if (resolution) {
          const pendingKey = aiPendingKey(ctx);
          const agentContext = {
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            sessionId: `session_${Date.now()}_${ctx.userId}`,
            history: await this.buildConversationMessages(ctx, state.input.bizId),
            bizId: state.input.bizId,
            roleIds: ctx.roleIds,
            deptId: ctx.deptId,
            queuePendingConfirm: (action: string, params: Record<string, unknown>) => {
              this.pendingConfirmActionMap.set(pendingKey, {
                action,
                params,
                requestedAt: Date.now(),
              });
            },
          };
          return executeStructuredRouterResult(resolution, host, state, skillRouter, agentContext);
        }
        return {
          success: true,
          output: STRUCTURED_ROUTING_CLARIFY_MESSAGE,
          metadata: buildMeta(state.startedAt),
        };
      }

      if (!isStructuredRoutingEnabled()) {
        if (!chatOpts?.llmCanonicalOperation) {
          await maybeApplyLlmExplicitOperationAugmentation(state, ctx);
        }

        const guardResult = await runStructuredGuardPhase(host, state);
        if (guardResult) return guardResult;
        const explicitResult = await runExplicitOperationsPhase(host, state);
        if (explicitResult) return explicitResult;
        if (state.isExplicitOperation && !state.relaxExplicitOperationFailure) {
          return {
            success: true,
            output:
              "我识别到你在发起操作指令，但当前信息不足或目标不唯一，因此未执行任何写入操作。\n" +
              "请补充明确目标（任务ID或完整任务名），例如：\n" +
              "1) 将任务 19 状态改为已完成\n" +
              "2) 将任务 ggg 优先级改为P1\n" +
              "3) 将任务 ggg 截止时间改为 2026-08-18",
            metadata: buildMeta(state.startedAt),
          };
        }
      }

      try {
        const skillRouter = getSkillRouterAgent();
        const pendingKey = aiPendingKey(ctx);
        const agentContext = {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          sessionId: `session_${Date.now()}_${ctx.userId}`,
          history: await this.buildConversationMessages(ctx, state.input.bizId),
          bizId: state.input.bizId,
          roleIds: ctx.roleIds,
          deptId: ctx.deptId,
          queuePendingConfirm: (action: string, params: Record<string, unknown>) => {
            this.pendingConfirmActionMap.set(pendingKey, {
              action,
              params,
              requestedAt: Date.now(),
            });
          },
        };
        const agentResult = await skillRouter.routeAndExecute(state.question, agentContext);
        return agentResultToAiResponse(agentResult, state.startedAt);
      } catch (routerError) {
        console.error("Skill路由器处理失败:", routerError);
        if (hasRealLlm()) {
          const llm = await this.callDeepSeekChat(state.question, ctx, state.input.bizId);
          return {
            success: true,
            output: llm.output,
            suggestions: [
              "帮我总结今天最该先做的3件事",
              "帮我把当前项目里待开始的任务批量改为进行中",
              "给我一版本周工作总结草稿",
            ],
            metadata: buildMeta(state.startedAt, {
              model: env.DEEPSEEK_MODEL,
              tokensUsed: llm.tokensUsed,
            }),
          };
        }
        return {
          success: true,
          output:
            `已收到你的问题：「${state.question}」。\n` +
            `当前处于规则引擎模式，Skill路由器处理失败: ${routerError instanceof Error ? routerError.message : "未知错误"}`,
          metadata: buildMeta(state.startedAt),
        };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "AI处理失败",
      };
    }
  }

  async generateWeeklyReport(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    return runGenerateWeeklyReport(params, ctx);
  }

  async previewBatchAdjust(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    return runBatchAdjustPreview(params, ctx);
  }

  async generateTaskInsight(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    return runGenerateTaskInsight(params, ctx);
  }

  async breakdownTask(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    return runBreakdownTask(params, ctx);
  }

  isAvailable(): boolean {
    return env.AI_FEATURE_ENABLED !== false;
  }

  async confirmAction(action: string, params: any, ctx: AuthContext): Promise<AiResponse> {
    const startedAt = Date.now();
    this.pendingConfirmActionMap.delete(aiPendingKey(ctx));
    return runConfirmActionSwitch(action, params, ctx, startedAt);
  }
}
