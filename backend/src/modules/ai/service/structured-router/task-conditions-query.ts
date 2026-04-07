import type { Prisma } from "@prisma/client";
import { toDbId } from "../../../../common/db-values";
import { prisma } from "../../../../common/prisma";
import type { AuthContext } from "../../../../common/types";
import { parseLooseDate, toTaskStatus, toTaskStatusCode } from "../../core/ai.domain-format";
import { canManageTask } from "../../core/ai.permissions";
import type { TaskQueryConditions } from "./task-conditions.schema";
import { conditionsHaveAnyField } from "./task-conditions.schema";

export type TaskConditionCandidate = {
  id: string;
  taskName: string;
  status: string | null;
  priority: string | null;
  progress: unknown;
  dueTime: Date | null;
  projectId: string | null;
  projectName?: string;
};

function dayRange(dateStr: string): { gte: Date; lt: Date } | null {
  const d = parseLooseDate(dateStr.trim());
  if (!d) return null;
  const gte = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const lt = new Date(gte);
  lt.setDate(lt.getDate() + 1);
  return { gte, lt };
}

function endOfDay(dateStr: string): Date | null {
  const r = dayRange(dateStr);
  if (!r) return null;
  const t = new Date(r.lt);
  t.setMilliseconds(t.getMilliseconds() - 1);
  return t;
}

function startOfDay(dateStr: string): Date | null {
  const r = dayRange(dateStr);
  return r?.gte ?? null;
}

export async function findTasksByConditions(
  ctx: AuthContext,
  conditions: TaskQueryConditions,
  opts: {
    scopedProjectId: bigint | null;
    delFlag: "0" | "1";
    take: number;
  },
): Promise<TaskConditionCandidate[]> {
  if (!conditionsHaveAnyField(conditions)) return [];

  const and: Prisma.TaskWhereInput[] = [{ tenantId: ctx.tenantId, delFlag: opts.delFlag }];

  if (opts.scopedProjectId) {
    and.push({ projectId: opts.scopedProjectId });
  }

  const tc = conditions.title_contains?.trim();
  if (tc) {
    and.push({ taskName: { contains: tc, mode: "insensitive" } });
  }

  const st = conditions.status?.trim();
  if (st) {
    and.push({ status: toTaskStatusCode(st) });
  }

  const pnc = conditions.project_name_contains?.trim();
  if (pnc) {
    const projects = await prisma.project.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        projectName: { contains: pnc, mode: "insensitive" },
      },
      select: { id: true },
      take: 50,
    });
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) {
      and.push({ id: { in: [] } });
    } else {
      and.push({ projectId: { in: ids } });
    }
  }

  const dueOn = conditions.due_on?.trim();
  if (dueOn) {
    const r = dayRange(dueOn);
    if (r) {
      and.push({ dueTime: { gte: r.gte, lt: r.lt } });
    }
  }

  const dueBefore = conditions.due_before?.trim();
  if (dueBefore) {
    const end = endOfDay(dueBefore);
    if (end) {
      and.push({ dueTime: { lte: end } });
    }
  }

  const dueAfter = conditions.due_after?.trim();
  if (dueAfter) {
    const start = startOfDay(dueAfter);
    if (start) {
      and.push({ dueTime: { gte: start } });
    }
  }

  const rows = await prisma.task.findMany({
    where: { AND: and },
    select: {
      id: true,
      taskName: true,
      status: true,
      priority: true,
      progress: true,
      dueTime: true,
      projectId: true,
    },
    orderBy: { id: "desc" },
    take: opts.take,
  });

  const projectIds = Array.from(
    new Set(rows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)),
  );
  const projectRows =
    projectIds.length > 0
      ? await prisma.project.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: projectIds.map((id) => toDbId(id)) },
            delFlag: "0",
          },
          select: { id: true, projectName: true },
        })
      : [];
  const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));

  const out: TaskConditionCandidate[] = [];
  for (const row of rows) {
    const taskId = String(row.id);
    if (!(await canManageTask(ctx, taskId))) continue;
    out.push({
      id: taskId,
      taskName: row.taskName ?? "",
      status: row.status,
      priority: row.priority,
      progress: row.progress,
      dueTime: row.dueTime,
      projectId: row.projectId ? String(row.projectId) : null,
      projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
    });
  }

  return out;
}

export async function formatTaskDetailBlock(
  ctx: AuthContext,
  taskId: string,
): Promise<string | null> {
  if (!(await canManageTask(ctx, taskId))) return null;
  const task = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
    select: { id: true, taskName: true, status: true, priority: true, progress: true, dueTime: true, projectId: true },
  });
  if (!task) return null;
  const project = task.projectId
    ? await prisma.project.findFirst({
        where: { tenantId: ctx.tenantId, id: task.projectId, delFlag: "0" },
        select: { projectName: true },
      })
    : null;
  return (
    `任务详情：\n` +
    `  - ID: ${task.id}\n` +
    `  - 标题: ${task.taskName}\n` +
    `  - 状态: ${toTaskStatus(task.status)}\n` +
    `  - 优先级: ${task.priority ?? "未设置"}\n` +
    `  - 进度: ${Number(task.progress ?? 0).toFixed(0)}%\n` +
    `  - 截止时间: ${task.dueTime?.toISOString().slice(0, 10) ?? "未设置"}\n` +
    `  - 所属项目: ${project?.projectName ?? "未归属项目"}`
  );
}
