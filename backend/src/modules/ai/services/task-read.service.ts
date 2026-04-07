import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";

/** 风险分析等 Skill 共用的任务详情字段 */
export type TaskDetailRow = {
  id: bigint;
  taskName: string | null;
  status: string | null;
  priority: string | null;
  progress: unknown;
  dueTime: Date | null;
  riskLevel: string | null;
  taskDesc: string | null;
  assigneeUserId: bigint | null;
  projectId: bigint | null;
};

export type ProjectSummaryRow = {
  projectName: string | null;
  progress: unknown;
  endTime: Date | null;
};

/**
 * 按租户加载单条任务及所属项目摘要（带 tenant 隔离，避免跨租户读项目）。
 */
export async function getTaskWithProjectSummary(
  tenantId: string,
  taskId: string,
): Promise<{ task: TaskDetailRow; project: ProjectSummaryRow | null } | null> {
  const task = await prisma.task.findFirst({
    where: { tenantId, id: toDbId(taskId), delFlag: "0" },
    select: {
      id: true,
      taskName: true,
      status: true,
      priority: true,
      progress: true,
      dueTime: true,
      riskLevel: true,
      taskDesc: true,
      assigneeUserId: true,
      projectId: true,
    },
  });
  if (!task) return null;

  let project: ProjectSummaryRow | null = null;
  if (task.projectId) {
    const p = await prisma.project.findFirst({
      where: { tenantId, id: task.projectId, delFlag: "0" },
      select: { projectName: true, progress: true, endTime: true },
    });
    if (p) project = p;
  }

  return { task, project };
}

/** 周报 Skill：项目头信息 */
export type ProjectReportHeader = {
  id: bigint;
  projectName: string | null;
  status: string | null;
  progress: unknown;
  startTime: Date | null;
  endTime: Date | null;
  ownerUserId: bigint | null;
};

/** 周报 Skill：任务列表行 */
export type TaskReportRow = {
  id: bigint;
  taskName: string | null;
  status: string | null;
  priority: string | null;
  progress: unknown;
  dueTime: Date | null;
  riskLevel: string | null;
  assigneeUserId: bigint | null;
  /** 全项目周报等场景可选，用于判断「本周完成」 */
  finishTime?: Date | null;
  updateTime?: Date | null;
};

export async function getProjectReportHeader(
  tenantId: string,
  projectId: string,
): Promise<ProjectReportHeader | null> {
  return prisma.project.findFirst({
    where: { tenantId, id: toDbId(projectId), delFlag: "0" },
    select: {
      id: true,
      projectName: true,
      status: true,
      progress: true,
      startTime: true,
      endTime: true,
      ownerUserId: true,
    },
  });
}

export async function listTasksForProjectReport(
  tenantId: string,
  projectId: string,
): Promise<TaskReportRow[]> {
  return prisma.task.findMany({
    where: { tenantId, projectId: toDbId(projectId), delFlag: "0" },
    select: {
      id: true,
      taskName: true,
      status: true,
      priority: true,
      progress: true,
      dueTime: true,
      riskLevel: true,
      assigneeUserId: true,
    },
  });
}

/** 租户下全部项目及其任务（用于「全项目周报」） */
export type ProjectWithTaskRows = {
  header: ProjectReportHeader;
  tasks: TaskReportRow[];
};

export async function listTenantProjectsWithTaskRows(tenantId: string): Promise<ProjectWithTaskRows[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId, delFlag: "0" },
    select: {
      id: true,
      projectName: true,
      status: true,
      progress: true,
      startTime: true,
      endTime: true,
      ownerUserId: true,
    },
    orderBy: { id: "asc" },
  });
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const taskRows = await prisma.task.findMany({
    where: { tenantId, delFlag: "0", projectId: { in: projectIds } },
    select: {
      id: true,
      projectId: true,
      taskName: true,
      status: true,
      priority: true,
      progress: true,
      dueTime: true,
      riskLevel: true,
      assigneeUserId: true,
      finishTime: true,
      updateTime: true,
    },
    orderBy: [{ projectId: "asc" }, { id: "asc" }],
  });

  const byPid = new Map<string, TaskReportRow[]>();
  for (const t of taskRows) {
    if (t.projectId == null) continue;
    const pid = String(t.projectId);
    const row: TaskReportRow = {
      id: t.id,
      taskName: t.taskName,
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      dueTime: t.dueTime,
      riskLevel: t.riskLevel,
      assigneeUserId: t.assigneeUserId,
      finishTime: t.finishTime,
      updateTime: t.updateTime,
    };
    if (!byPid.has(pid)) byPid.set(pid, []);
    byPid.get(pid)!.push(row);
  }

  return projects.map((h) => ({
    header: h,
    tasks: byPid.get(String(h.id)) ?? [],
  }));
}

/** assigneeUserId -> 昵称 */
export async function mapAssigneeNickNames(
  tenantId: string,
  assigneeUserIds: bigint[],
): Promise<Map<bigint, string>> {
  const unique = [...new Set(assigneeUserIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { tenantId, userId: { in: unique }, delFlag: "0" },
    select: { userId: true, nickName: true },
  });
  return new Map(users.map((u) => [u.userId, u.nickName ?? ""]));
}
