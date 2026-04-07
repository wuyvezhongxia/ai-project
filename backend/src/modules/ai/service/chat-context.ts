import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";
import { isNumericId, toProjectStatus, toTaskStatus } from "../core/ai.domain-format";

export async function buildAiChatContext(ctx: AuthContext, bizId?: string) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const [
    projectCount,
    ownedTaskCount,
    riskTaskCount,
    recentTasks,
    todayDueTasks,
    highPriorityTasks,
    delayedTasks,
    userProjects,
  ] = await Promise.all([
    prisma.project.count({ where: { tenantId: ctx.tenantId, delFlag: "0" } }),
    prisma.task.count({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        assigneeUserId: toDbId(ctx.userId),
      },
    }),
    prisma.task.count({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        riskLevel: { in: ["2", "3"] },
        status: { not: "2" },
      },
    }),
    prisma.task.findMany({
      where: { tenantId: ctx.tenantId, delFlag: "0" },
      orderBy: { id: "desc" },
      select: { taskName: true, status: true, dueTime: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        assigneeUserId: toDbId(ctx.userId),
        dueTime: { gte: todayStart, lt: todayEnd },
        status: { not: "2" },
      },
      select: { id: true, taskName: true, status: true, priority: true },
      take: 10,
    }),
    prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        assigneeUserId: toDbId(ctx.userId),
        priority: "0",
        status: { not: "2" },
      },
      select: { id: true, taskName: true, status: true, dueTime: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        assigneeUserId: toDbId(ctx.userId),
        status: "3",
      },
      select: { id: true, taskName: true, dueTime: true, riskLevel: true },
      take: 5,
    }),
    prisma.project.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        OR: [{ ownerUserId: toDbId(ctx.userId) }, { createBy: toDbId(ctx.userId) }],
      },
      select: { id: true, projectName: true, status: true, progress: true },
      take: 5,
    }),
  ]);

  let projectDetail: string | null = null;
  if (bizId && isNumericId(bizId)) {
    const project = await prisma.project.findFirst({
      where: { tenantId: ctx.tenantId, id: toDbId(bizId), delFlag: "0" },
      select: { projectName: true, status: true, progress: true, endTime: true, ownerUserId: true },
    });
    if (project) {
      projectDetail = `当前关注项目：${project.projectName}，状态 ${toProjectStatus(project.status)}，进度 ${Number(
        project.progress ?? 0,
      ).toFixed(0)}%，截止 ${project.endTime?.toISOString().slice(0, 10) ?? "未设置"}，负责人：用户${project.ownerUserId}`;
    }
  }

  return {
    projectCount,
    ownedTaskCount,
    riskTaskCount,
    todayDueTasks: todayDueTasks.map((t) => ({
      id: String(t.id),
      taskName: t.taskName,
      status: toTaskStatus(t.status),
      priority: t.priority === "0" ? "紧急" : t.priority === "1" ? "高" : "普通",
    })),
    highPriorityTasks: highPriorityTasks.map((t) => ({
      id: String(t.id),
      taskName: t.taskName,
      status: toTaskStatus(t.status),
      dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
    })),
    delayedTasks: delayedTasks.map((t) => ({
      id: String(t.id),
      taskName: t.taskName,
      dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
      riskLevel: t.riskLevel === "3" ? "高风险" : t.riskLevel === "2" ? "中风险" : "低风险",
    })),
    userProjects: userProjects.map((p) => ({
      id: String(p.id),
      projectName: p.projectName,
      status: toProjectStatus(p.status),
      progress: Number(p.progress ?? 0).toFixed(0) + "%",
    })),
    recentTasks: recentTasks.map((t) => ({
      taskName: t.taskName,
      status: toTaskStatus(t.status),
      dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
    })),
    projectDetail,
    currentDate: today.toISOString().slice(0, 10),
  };
}
