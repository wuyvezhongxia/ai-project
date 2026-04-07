import { toDbId } from "../../../../common/db-values";
import { prisma } from "../../../../common/prisma";
import { buildMeta } from "../../core/ai.meta";
import {
  parseLooseDate,
  toTaskPriorityCode,
  toTaskPriorityLabel,
  toTaskStatus,
  toTaskStatusCode,
} from "../../core/ai.domain-format";
import { canManageTask } from "../../core/ai.permissions";
import { cleanQuotedText } from "../../core/ai.text-utils";
import type { AiChatHost, ChatTurnState } from "../../chat/chat-host";
import type { AiResponse, PendingTaskDisambiguation } from "../../core/ai.types";
import { aiPendingKey } from "../pending-keys";
import { resolveProjectForTask } from "../project-task-ops";
import {
  conditionsHaveAnyField,
  parseTaskQueryConditions,
  type TaskQueryConditions,
} from "./task-conditions.schema";
import { findTasksByConditions, formatTaskDetailBlock, type TaskConditionCandidate } from "./task-conditions-query";

const TASK_CONDITION_OPS = new Set([
  "delete_task",
  "restore_task",
  "view_task",
  "update_task_status",
  "update_task_priority",
  "update_task_due",
  "begin_modify_task",
  "move_task_to_project",
]);

/** 当前在项目上下文（bizId）下按标题搜任务：若本项目没有，再全租户搜一次（与列表页「全部任务」一致） */
function shouldRetryTaskSearchWithoutProjectScope(conditions: TaskQueryConditions): boolean {
  if (conditions.project_name_contains?.trim()) return false;
  return Boolean(conditions.title_contains?.trim());
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** 「查看mmmm任务」等：去掉首尾「任务」再 contains */
function normalizeTitleHintForTaskSearch(raw: string): string {
  return raw
    .replace(/^任务\s*/u, "")
    .replace(/任务\s*$/u, "")
    .trim();
}

function resolveConditionsFromArgs(args: Record<string, unknown>): TaskQueryConditions | null {
  const parsed = parseTaskQueryConditions(args.conditions);
  if (parsed && conditionsHaveAnyField(parsed)) {
    const tc = parsed.title_contains?.trim();
    if (tc) return { ...parsed, title_contains: normalizeTitleHintForTaskSearch(tc) };
    return parsed;
  }
  const title = str(args.task_title);
  if (title) return { title_contains: normalizeTitleHintForTaskSearch(title) };
  return null;
}

/** 路由误填 task_id 时，从用户原话抽标题片段做 title_contains 回退（含「查看ai2」等无空格写法） */
function inferTitleContainsFromUserUtterance(op: string, userText: string): string | null {
  const t = userText.trim();
  const ok = (s: string) => s.length > 0 && !/^\d+$/.test(s);

  if (op === "view_task") {
    const viewRes = [
      /^(?:请|帮我|麻烦|可以)?\s*查看\s*(.+)$/,
      /^(?:请|帮我|麻烦)?\s*看(?:一下)?\s*任务\s*(.+)$/,
      /^查询\s*任务\s*(.+)$/,
      /^任务(?:详情|信息)?\s*[:：]?\s*(.+)$/,
    ];
    for (const re of viewRes) {
      const m = t.match(re);
      let raw = m?.[1] ? cleanQuotedText(m[1].trim()) : "";
      raw = normalizeTitleHintForTaskSearch(raw);
      if (ok(raw)) return raw;
    }
  }

  if (op === "delete_task") {
    const m = t.match(/^(?:请|帮我|麻烦|可以)?\s*(?:删除|移除)(?:掉|了)?\s*(.+)$/);
    let raw = m?.[1] ? cleanQuotedText(m[1].trim()) : "";
    raw = normalizeTitleHintForTaskSearch(raw);
    if (ok(raw)) return raw;
  }

  if (op === "restore_task") {
    const m = t.match(/^(?:请|帮我|麻烦|可以)?\s*(?:恢复|还原)\s*任务\s*(.+)$/);
    let raw = m?.[1] ? cleanQuotedText(m[1].trim()) : "";
    raw = normalizeTitleHintForTaskSearch(raw);
    if (ok(raw)) return raw;
  }

  if (op === "begin_modify_task") {
    const m = t.match(/^(?:请|帮我|麻烦|可以)?\s*修改\s*(?:任务)?\s*(.+)$/);
    let raw = m?.[1] ? cleanQuotedText(m[1].trim()) : "";
    raw = normalizeTitleHintForTaskSearch(raw);
    if (ok(raw)) return raw;
  }

  return null;
}

function listCandidatesText(
  candidates: Array<{ taskName: string; status: string | null; projectName?: string }>,
  delHint: string,
): string {
  return candidates
    .map((c, i) => {
      const st = toTaskStatus(c.status);
      const del = delHint ? ` ${delHint}` : "";
      return `${i + 1}. ${c.taskName}（${c.projectName ?? "未归属项目"}，${st}）${del}`;
    })
    .join("\n");
}

async function confirmDeleteByTaskId(
  _host: AiChatHost,
  state: ChatTurnState,
  taskId: string,
): Promise<AiResponse> {
  const { startedAt, ctx } = state;
  if (!(await canManageTask(ctx, taskId))) {
    return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
  }
  const existing = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
    select: { id: true, taskName: true, projectId: true },
  });
  if (!existing) {
    return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
  }
  const project = existing.projectId
    ? await prisma.project.findFirst({
        where: { tenantId: ctx.tenantId, id: existing.projectId, delFlag: "0" },
        select: { projectName: true },
      })
    : null;
  return {
    success: true,
    output: `检测到删除任务请求：任务「${existing.taskName}」${project?.projectName ? `（项目：${project.projectName}）` : ""}。请确认是否删除。`,
    requiresConfirmation: true,
    confirmationData: {
      action: "deleteTask",
      params: {
        taskId,
        taskName: existing.taskName,
        projectName: project?.projectName ?? undefined,
        module: "task",
      },
      message: `确定要删除任务「${existing.taskName}」吗？此操作无法撤销。`,
    },
    metadata: buildMeta(startedAt),
  };
}

async function viewByTaskId(state: ChatTurnState, taskId: string): Promise<AiResponse> {
  const { startedAt, ctx } = state;
  const block = await formatTaskDetailBlock(ctx, taskId);
  if (!block) {
    return { success: false, output: "", error: `任务 ${taskId} 不存在或你无权查看` };
  }
  return { success: true, output: block, metadata: buildMeta(startedAt) };
}

async function restoreByTaskId(state: ChatTurnState, taskId: string): Promise<AiResponse> {
  const { startedAt, ctx } = state;
  if (!(await canManageTask(ctx, taskId))) {
    return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
  }
  const existing = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id: toDbId(taskId) },
    select: { id: true, taskName: true, delFlag: true },
  });
  if (!existing) {
    return { success: false, output: "", error: `任务 ${taskId} 不存在` };
  }
  if (existing.delFlag === "0") {
    return { success: true, output: `任务 ${taskId} 当前是正常状态，无需恢复。`, metadata: buildMeta(startedAt) };
  }
  await prisma.task.update({
    where: { id: existing.id },
    data: { delFlag: "0", updateBy: toDbId(ctx.userId), updateTime: new Date() },
  });
  return {
    success: true,
    output: `任务 ${taskId}（${existing.taskName}）已恢复。`,
    metadata: buildMeta(startedAt),
  };
}

async function tryCompleteTaskOpById(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  args: Record<string, unknown>,
  taskId: string,
): Promise<AiResponse | null> {
  const { startedAt, ctx, pendingConfirmKey, pendingModifyKey } = state;

  switch (op) {
    case "delete_task":
      return confirmDeleteByTaskId(host, state, taskId);
    case "view_task":
      return viewByTaskId(state, taskId);
    case "restore_task":
      return restoreByTaskId(state, taskId);
    case "begin_modify_task": {
      if (!(await canManageTask(ctx, taskId))) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
      }
      const existing = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true },
      });
      if (!existing) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      const name = existing.taskName ?? "";
      host.pendingTaskModifyTargetMap.set(pendingModifyKey, {
        raw: name,
        coreName: name,
        requestedAt: Date.now(),
      });
      return {
        success: true,
        output: `已选中任务「${name}」。请说明要修改的内容，例如：将状态改为已完成、将优先级改为 P1、将截止时间改为 2026-04-10。`,
        metadata: buildMeta(startedAt),
      };
    }
    case "move_task_to_project": {
      const projectName = str(args.project_name) ?? str(args.project_title);
      if (!projectName) return null;
      if (!(await canManageTask(ctx, taskId))) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
      }
      const existing = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true },
      });
      if (!existing) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      const project = await resolveProjectForTask(ctx, state.input.bizId, projectName);
      if (!project) {
        return {
          success: true,
          output: `没有找到项目「${projectName}」。请提供更准确的项目名称。`,
          metadata: buildMeta(startedAt),
        };
      }
      await prisma.task.update({
        where: { id: existing.id },
        data: { projectId: project.id, updateBy: toDbId(ctx.userId), updateTime: new Date() },
      });
      return {
        success: true,
        output:
          `任务已移动成功：\n` +
          `- ID: ${existing.id}\n` +
          `- 标题: ${existing.taskName}\n` +
          `- 新项目: ${project.projectName}`,
        metadata: buildMeta(startedAt),
      };
    }
    case "update_task_status": {
      const statusLabel = str(args.status);
      if (!statusLabel) return null;
      const toStatus = toTaskStatusCode(statusLabel);
      if (!(await canManageTask(ctx, taskId))) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
      }
      const existing = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true, status: true },
      });
      if (!existing) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      const confirmParams = {
        taskId,
        taskName: existing.taskName,
        fromStatus: existing.status,
        toStatus,
        module: "task",
      };
      host.pendingConfirmActionMap.set(pendingConfirmKey, {
        action: "updateTaskStatus",
        params: { taskId, toStatus },
        requestedAt: Date.now(),
      });
      return {
        success: true,
        output: `检测到修改状态请求：任务「${existing.taskName}」将变更为「${toTaskStatus(toStatus)}」。请确认是否执行。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "updateTaskStatus",
          params: confirmParams,
          message: `确定将任务「${existing.taskName}」状态改为「${toTaskStatus(toStatus)}」吗？`,
        },
        metadata: buildMeta(startedAt),
      };
    }
    case "update_task_priority": {
      const pr = str(args.priority);
      if (!pr) return null;
      const toPriority = toTaskPriorityCode(pr);
      if (!(await canManageTask(ctx, taskId))) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
      }
      const existing = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true, priority: true },
      });
      if (!existing) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      const confirmParams = { taskId, taskName: existing.taskName, toPriority, module: "task" };
      host.pendingConfirmActionMap.set(pendingConfirmKey, {
        action: "updateTaskPriority",
        params: { taskId, toPriority },
        requestedAt: Date.now(),
      });
      return {
        success: true,
        output: `检测到修改优先级请求：任务「${existing.taskName}」将变更为「${toTaskPriorityLabel(toPriority)}」。请确认是否执行。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "updateTaskPriority",
          params: confirmParams,
          message: `确定将任务「${existing.taskName}」优先级改为「${toTaskPriorityLabel(toPriority)}」吗？`,
        },
        metadata: buildMeta(startedAt),
      };
    }
    case "update_task_due": {
      const dueRaw = str(args.due);
      if (dueRaw === undefined) return null;
      if (!(await canManageTask(ctx, taskId))) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
      }
      const existing = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true, dueTime: true, projectId: true },
      });
      if (!existing) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      const project = existing.projectId
        ? await prisma.project.findFirst({
            where: { tenantId: ctx.tenantId, id: existing.projectId, delFlag: "0" },
            select: { projectName: true },
          })
        : null;
      let toDue: string | null;
      if (/无|清空|取消|不需要/.test(dueRaw)) {
        toDue = null;
      } else {
        const d = parseLooseDate(dueRaw);
        if (!d) {
          return { success: false, output: "", error: `截止时间格式无效：${dueRaw}` };
        }
        toDue = d.toISOString().slice(0, 10);
      }
      const confirmParams = {
        taskId,
        taskName: existing.taskName,
        fromDue: existing.dueTime ? existing.dueTime.toISOString().slice(0, 10) : null,
        toDue,
        projectName: project?.projectName,
        module: "task",
      };
      host.pendingConfirmActionMap.set(pendingConfirmKey, {
        action: "updateTaskDue",
        params: { taskId, toDue },
        requestedAt: Date.now(),
      });
      return {
        success: true,
        output: `检测到修改截止时间请求：任务「${existing.taskName}」将变更为「${toDue ?? "未设置"}」。请确认是否执行。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "updateTaskDue",
          params: confirmParams,
          message: `确定将任务「${existing.taskName}」截止时间改为「${toDue ?? "未设置"}」吗？`,
        },
        metadata: buildMeta(startedAt),
      };
    }
    default:
      return null;
  }
}

function storeDisambiguation(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  routerArgs: Record<string, unknown>,
  candidates: TaskConditionCandidate[],
): void {
  const key = aiPendingKey(state.ctx);
  const slim = candidates.map((c) => ({
    id: c.id,
    taskName: c.taskName,
    status: c.status,
    projectName: c.projectName,
  }));
  host.pendingTaskDisambiguationMap.set(key, {
    op,
    routerArgs,
    candidates: slim,
    requestedAt: Date.now(),
  });
}

async function completeSingleCandidateOp(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  args: Record<string, unknown>,
  c: TaskConditionCandidate,
): Promise<AiResponse> {
  return (await tryCompleteTaskOpById(host, state, op, args, c.id)) ?? {
    success: true,
    output: "当前操作无法仅通过任务 ID 完成，请补充参数后重试。",
    metadata: buildMeta(state.startedAt),
  };
}

async function runConditionBasedTaskOp(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  args: Record<string, unknown>,
  conditions: TaskQueryConditions,
): Promise<AiResponse> {
  const delFlag: "0" | "1" = op === "restore_task" ? "1" : "0";
  const optsBase = { delFlag, take: 12 as const };

  let candidates = await findTasksByConditions(state.ctx, conditions, {
    ...optsBase,
    scopedProjectId: state.scopedProjectId,
  });

  if (
    candidates.length === 0 &&
    state.scopedProjectId &&
    shouldRetryTaskSearchWithoutProjectScope(conditions)
  ) {
    candidates = await findTasksByConditions(state.ctx, conditions, {
      ...optsBase,
      scopedProjectId: null,
    });
  }

  if (candidates.length === 0) {
    const hint =
      delFlag === "1"
        ? "没有找到符合条件的已删除任务，无法恢复。"
        : "没有找到符合条件的任务。可尝试换关键词、项目名或日期条件后再说一次。";
    return { success: true, output: hint, metadata: buildMeta(state.startedAt) };
  }

  if (candidates.length === 1) {
    return completeSingleCandidateOp(host, state, op, args, candidates[0]!);
  }

  const delHint = delFlag === "1" ? "（已删除）" : "";
  storeDisambiguation(host, state, op, args, candidates.slice(0, 10));
  const lines = listCandidatesText(
    candidates.slice(0, 10).map((c) => ({
      id: c.id,
      taskName: c.taskName,
      status: c.status,
      projectName: c.projectName,
    })),
    delHint,
  );
  const batchHint = op === "delete_task" ? "\n若确实要删除以上全部，请回复「都删除」，再按提示确认。" : "";
  return {
    success: true,
    output:
      `找到多个可能匹配的任务，请回复序号（如「1」或「第一个」）或完整标题以指定一条：\n${lines}${batchHint}`,
    metadata: buildMeta(state.startedAt),
  };
}

function resolveEffectiveConditions(
  op: string,
  args: Record<string, unknown>,
  userText: string,
): TaskQueryConditions | null {
  const c = resolveConditionsFromArgs(args);
  if (c && conditionsHaveAnyField(c)) return c;
  const hint = inferTitleContainsFromUserUtterance(op, userText);
  return hint ? { title_contains: hint } : null;
}

/**
 * 结构化路由 operation：按任务 ID 或 conditions 执行任务类操作（删除 / 查看 / 更新 / 移动 / 恢复）。
 */
export async function tryExecuteTaskConditionsFlow(
  host: AiChatHost,
  state: ChatTurnState,
  op: string,
  args: Record<string, unknown>,
): Promise<AiResponse | null> {
  if (!TASK_CONDITION_OPS.has(op)) return null;

  const effective =
    resolveEffectiveConditions(op, args, state.input.inputText) ??
    resolveEffectiveConditions(op, args, state.question);

  const taskId = str(args.task_id);
  if (taskId && /^\d+$/.test(taskId)) {
    const r = await tryCompleteTaskOpById(host, state, op, args, taskId);
    if (r?.success) return r;
    if (effective && conditionsHaveAnyField(effective)) {
      return runConditionBasedTaskOp(host, state, op, args, effective);
    }
    return r ?? null;
  }

  if (!effective || !conditionsHaveAnyField(effective)) return null;

  return runConditionBasedTaskOp(host, state, op, args, effective);
}

/**
 * pending：用户已从消歧列表中选定任务，继续执行原 op。
 */
export async function executePickedTaskDisambiguation(
  host: AiChatHost,
  state: ChatTurnState,
  pending: PendingTaskDisambiguation,
  pickedId: string,
): Promise<AiResponse> {
  const hit = pending.candidates.find((c) => c.id === pickedId);
  if (!hit) {
    return {
      success: true,
      output: "选择无效，请重新从列表中回复序号或完整任务标题。",
      metadata: buildMeta(state.startedAt),
    };
  }
  const mergedArgs = { ...pending.routerArgs, task_id: pickedId };
  const r = await tryCompleteTaskOpById(host, state, pending.op, mergedArgs, pickedId);
  return (
    r ?? {
      success: true,
      output: "无法完成该操作，请换一种说法或联系管理员。",
      metadata: buildMeta(state.startedAt),
    }
  );
}
