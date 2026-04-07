import { buildMeta } from "../../core/ai.meta";
import { toProjectStatus, toTaskStatus } from "../../core/ai.domain-format";
import { runChatPendingPhases, runExplicitOperationsPhase } from "../../chat";
import type { AiChatHost, ChatTurnState } from "../../chat/chat-host";
import type { AiResponse } from "../../core/ai.types";
import type { SkillRouterAgent } from "../../skills/skill.router";
import type { AgentContext } from "../../skills/skill.types";
import { chatTurnHasAnyPendingRecord } from "../llm-operation-intent";
import { agentResultToAiResponse } from "../agent-result";
import type { StructuredRouterResult } from "./schema";
import {
  isDirectCreateOperation,
  operationToSyntheticSentence,
  tryBuildDirectCreateFromArgs,
} from "./synthetic";
import { tryExecuteViewProjectByUserText } from "./project-view-query";
import { tryExecuteTaskConditionsFlow } from "./task-conditions-execute";

async function executePendingResolve(
  host: AiChatHost,
  state: ChatTurnState,
  args: Record<string, unknown>,
): Promise<AiResponse> {
  const startedAt = state.startedAt;
  const raw = args.decision;
  const dec = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!chatTurnHasAnyPendingRecord(state)) {
    return {
      success: true,
      output: "当前没有待确认的多步操作。",
      metadata: buildMeta(startedAt),
    };
  }

  let syn: string | null = null;
  if (["confirm", "yes", "ok", "proceed", "accept"].includes(dec)) syn = "确认";
  else if (["cancel", "no", "reject", "abort", "deny"].includes(dec)) syn = "取消";

  if (!syn) {
    return {
      success: true,
      output: "当前有多步操作待处理。请回复「确认」执行，或「取消」放弃。",
      metadata: buildMeta(startedAt),
    };
  }

  const q = syn.replace(/\s+/g, "").toLowerCase();
  const st = { ...state, question: syn, q };
  const pr = await runChatPendingPhases(host, st);
  if (pr) return pr;

  return {
    success: true,
    output: "未能根据你的回复推进当前待办。请改用「确认」或「取消」。",
    metadata: buildMeta(startedAt),
  };
}

async function tryDirectCreate(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  args: Record<string, unknown>,
): Promise<AiResponse | null> {
  if (!isDirectCreateOperation(op)) return null;
  const spec = tryBuildDirectCreateFromArgs(op, args);
  if (!spec) return null;
  const { startedAt, ctx, input } = state;

  if (spec.kind === "project") {
    const created = await host.createProjectByName(ctx, spec.name);
    if (created.existed) {
      return {
        success: true,
        output: `已匹配到同名项目：${created.projectName}（ID: ${created.id}）。未重复创建。`,
        metadata: buildMeta(startedAt),
      };
    }
    return {
      success: true,
      output:
        `已创建项目：\n` +
        `- ID: ${created.id}\n` +
        `- 名称: ${created.projectName}\n` +
        `- 状态: ${toProjectStatus(created.status)}\n` +
        `- 当前进度: ${Number(created.progress ?? 0).toFixed(0)}%`,
      metadata: buildMeta(startedAt),
    };
  }

  const created = await host.createTaskFromDraft(
    ctx,
    input.bizId,
    { title: spec.title, projectName: spec.projectName },
    spec.dueAt,
  );
  return {
    success: true,
    output:
      `已创建任务：\n` +
      `- ID: ${created.id}\n` +
      `- 标题: ${created.taskName}\n` +
      `- 状态: ${toTaskStatus(created.status)}\n` +
      `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
      `- 截止时间: ${spec.dueAt ? spec.dueAt.toISOString().slice(0, 10) : "未设置"}`,
    metadata: buildMeta(startedAt),
  };
}

/**
 * 执行结构化路由结果：直连创建 → 合成句走 explicit → Skill → general。
 */
export async function executeStructuredRouterResult(
  resolution: StructuredRouterResult,
  host: AiChatHost,
  state: ChatTurnState,
  skillRouter: SkillRouterAgent,
  agentContext: AgentContext,
): Promise<AiResponse> {
  const { startedAt } = state;

  if (resolution.route === "skill") {
    const r = await skillRouter.runSkillById(resolution.skill_id, state.input.inputText, agentContext);
    if (r) return agentResultToAiResponse(r, startedAt);
    return {
      success: true,
      output: `未找到或未启用技能「${resolution.skill_id}」。请换种说法或从快捷入口选择。`,
      metadata: buildMeta(startedAt),
    };
  }

  if (resolution.route === "general") {
    const r = await skillRouter.runGeneralAgent(state.input.inputText, agentContext);
    return agentResultToAiResponse(r, startedAt);
  }

  const { op, args } = resolution;

  if (op === "pending_resolve") {
    return executePendingResolve(host, state, args);
  }

  const projectView = await tryExecuteViewProjectByUserText(state);
  if (projectView) return projectView;

  const taskCond = await tryExecuteTaskConditionsFlow(host, state, op, args);
  if (taskCond) return taskCond;

  const direct = await tryDirectCreate(host, state, op, args);
  if (direct) return direct;

  const synthetic = operationToSyntheticSentence(op, args);
  if (synthetic) {
    const st = { ...state, question: synthetic, q: synthetic.toLowerCase(), isExplicitOperation: true, relaxExplicitOperationFailure: true };
    const explicit = await runExplicitOperationsPhase(host, st);
    if (explicit) return explicit;
  }

  const r = await skillRouter.runGeneralAgent(state.input.inputText, agentContext);
  return agentResultToAiResponse(r, startedAt);
}
