import { parseLooseDate, toTaskStatus } from "../../core/ai.domain-format";
import type { StructuredRouterResult } from "./schema";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * 将结构化 op/args 转为现有 explicit 链可解析的固定句式（机器生成，不解析用户原文）。
 */
export function operationToSyntheticSentence(
  op: string,
  args: Record<string, unknown>,
): string | null {
  const taskId = str(args.task_id);
  const taskTitle = str(args.task_title);
  const taskRef = taskId ?? taskTitle;
  const projectName = str(args.project_name);
  const projectTitle = str(args.project_title) ?? projectName;

  switch (op) {
    case "delete_task":
      if (taskId) return `删除任务 ${taskId}`;
      if (taskTitle) return `删除任务 ${taskTitle}`;
      return null;
    case "restore_task":
      if (taskId) return `恢复任务 ${taskId}`;
      if (taskTitle) return `恢复任务 ${taskTitle}`;
      return null;
    case "view_task":
      if (taskRef) return `查看任务 ${taskRef}`;
      return null;
    case "update_task_status": {
      const st = str(args.status);
      if (!taskRef || !st) return null;
      const label = toTaskStatus(toTaskStatusCodeFromLabel(st));
      return `将任务 ${taskRef} 状态改为 ${label}`;
    }
    case "update_task_priority": {
      const pr = str(args.priority);
      if (!taskRef || !pr) return null;
      return `将任务 ${taskRef} 优先级改为 ${normalizePriorityText(pr)}`;
    }
    case "update_task_due": {
      if (!taskRef) return null;
      const due = str(args.due);
      if (due && /无|清空|取消|不需要/.test(due)) {
        return `将任务 ${taskRef} 截止时间改为 无截止时间`;
      }
      if (!due) return null;
      return `将任务 ${taskRef} 截止时间改为 ${due}`;
    }
    case "begin_modify_task":
      if (taskRef) return `修改任务 ${taskRef}`;
      return null;
    case "move_task_to_project":
      if (!taskRef || !projectTitle) return null;
      return `将任务 ${taskRef} 移动到项目 ${projectTitle}`;
    case "create_project":
      return "创建项目";
    case "create_task":
      return "创建任务";
    case "create_subtask":
      return "创建子任务";
    default:
      return null;
  }
}

function toTaskStatusCodeFromLabel(st: string): "0" | "1" | "2" | "3" {
  if (/已完成|完成/.test(st)) return "2";
  if (/进行中/.test(st)) return "1";
  if (/延期/.test(st)) return "3";
  return "0";
}

function normalizePriorityText(pr: string): string {
  const u = pr.toUpperCase();
  if (/^P[0-3]$/.test(u)) return u;
  if (/紧急/.test(pr)) return "P0";
  if (/高/.test(pr)) return "P1";
  if (/中/.test(pr)) return "P2";
  if (/低/.test(pr)) return "P3";
  return pr;
}

export function isDirectCreateOperation(op: string): boolean {
  return op === "create_project" || op === "create_task";
}

/**
 * 单轮直接创建（不经过 explicit 多轮 pending）。
 */
export function tryBuildDirectCreateFromArgs(
  op: string,
  args: Record<string, unknown>,
): { kind: "project"; name: string } | { kind: "task"; title: string; projectName?: string; dueAt?: Date } | null {
  if (op === "create_project") {
    const name = str(args.project_name);
    if (!name) return null;
    return { kind: "project", name };
  }
  if (op === "create_task") {
    const title = str(args.title);
    if (!title) return null;
    const projectName = str(args.project_name);
    const dueRaw = str(args.due);
    const dueAt = dueRaw ? parseLooseDate(dueRaw) ?? undefined : undefined;
    return { kind: "task", title, projectName, dueAt };
  }
  return null;
}

export function normalizeStructuredRouterPayload(raw: unknown): StructuredRouterResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const route = o.route;
  if (route === "general") return { route: "general" };
  if (route === "skill" && typeof o.skill_id === "string" && o.skill_id.trim()) {
    return { route: "skill", skill_id: o.skill_id.trim() };
  }
  if (route === "operation" && typeof o.op === "string" && o.op.trim()) {
    const args = o.args;
    const record =
      args && typeof args === "object" && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
    return { route: "operation", op: o.op.trim(), args: record };
  }
  return null;
}
