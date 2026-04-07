import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";
import { parseLooseDate, toTaskPriorityLabel, toTaskStatus } from "../core/ai.domain-format";
import { buildMeta } from "../core/ai.meta";
import { canManageTask } from "../core/ai.permissions";
import type { AiResponse } from "../core/ai.types";

export async function runConfirmActionSwitch(
  action: string,
  params: any,
  ctx: AuthContext,
  startedAt: number,
): Promise<AiResponse> {
  try {
    switch (action) {
      case "deleteTask": {
        const { taskId } = params;
        const hasPermission = await canManageTask(ctx, taskId);
        if (!hasPermission) {
          return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
        }

        const existing = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
          select: { id: true, taskName: true },
        });
        if (!existing) {
          return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
        }

        await prisma.task.update({
          where: { id: existing.id },
          data: { delFlag: "1", updateBy: toDbId(ctx.userId), updateTime: new Date() },
        });

        return {
          success: true,
          output: `任务「${existing.taskName}」已删除，已从任务列表移除（这不是“改为已完成”）。`,
          metadata: buildMeta(startedAt),
        };
      }
      case "deleteTasks": {
        const taskIds: string[] = Array.isArray(params?.taskIds)
          ? params.taskIds.map((v: unknown) => String(v)).filter((v: string) => /^\d+$/.test(v))
          : [];
        if (taskIds.length === 0) {
          return { success: false, output: "", error: "批量删除参数无效：缺少 taskIds" };
        }
        const rows = await prisma.task.findMany({
          where: { tenantId: ctx.tenantId, delFlag: "0", id: { in: taskIds.map((id) => toDbId(id)) } },
          select: { id: true, taskName: true },
        });
        if (rows.length === 0) {
          return { success: false, output: "", error: "可删除任务为空：这些任务可能已被删除" };
        }
        const manageable: bigint[] = [];
        const names: string[] = [];
        for (const row of rows) {
          const id = String(row.id);
          if (await canManageTask(ctx, id)) {
            manageable.push(row.id);
            names.push(row.taskName ?? id);
          }
        }
        if (manageable.length === 0) {
          return { success: false, output: "", error: "你没有这些任务的操作权限" };
        }
        await prisma.task.updateMany({
          where: { tenantId: ctx.tenantId, delFlag: "0", id: { in: manageable } },
          data: { delFlag: "1", updateBy: toDbId(ctx.userId), updateTime: new Date() },
        });
        return {
          success: true,
          output: `已删除 ${manageable.length} 个任务：${names.join("、")}。`,
          metadata: buildMeta(startedAt),
        };
      }

      case "updateTaskStatus": {
        const { taskId, toStatus } = params as { taskId?: string; toStatus?: string };
        if (!taskId || !toStatus || !["0", "1", "2", "3"].includes(toStatus)) {
          return { success: false, output: "", error: "修改任务状态参数无效" };
        }
        const hasPermission = await canManageTask(ctx, taskId);
        if (!hasPermission) {
          return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
        }
        const existing = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
          select: { id: true, taskName: true, status: true },
        });
        if (!existing) {
          return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
        }
        if (existing.status === toStatus) {
          return {
            success: true,
            output: `任务「${existing.taskName}」当前已是「${toTaskStatus(toStatus)}」，无需重复修改。`,
            metadata: buildMeta(startedAt),
          };
        }
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            status: toStatus,
            progress: toStatus === "2" ? "100" : undefined,
            finishTime: toStatus === "2" ? new Date() : null,
            updateBy: toDbId(ctx.userId),
            updateTime: new Date(),
          },
        });
        const verified = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: existing.id, delFlag: "0" },
          select: { id: true, taskName: true, status: true },
        });
        if (!verified || verified.status !== toStatus) {
          return { success: false, output: "", error: "状态更新回查失败：数据库结果与预期不一致" };
        }
        return {
          success: true,
          output: `任务「${verified.taskName}」(ID: ${verified.id}) 状态已更新为「${toTaskStatus(verified.status)}」。`,
          metadata: buildMeta(startedAt),
        };
      }

      case "updateTaskPriority": {
        const { taskId, toPriority } = params as { taskId?: string; toPriority?: string };
        if (!taskId || !toPriority || !["0", "1", "2", "3"].includes(toPriority)) {
          return { success: false, output: "", error: "修改任务优先级参数无效" };
        }
        const hasPermission = await canManageTask(ctx, taskId);
        if (!hasPermission) {
          return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
        }
        const existing = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
          select: { id: true, taskName: true, priority: true },
        });
        if (!existing) {
          return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
        }
        if (existing.priority === toPriority) {
          return {
            success: true,
            output: `任务「${existing.taskName}」当前已是「${toTaskPriorityLabel(toPriority)}」，无需重复修改。`,
            metadata: buildMeta(startedAt),
          };
        }
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            priority: toPriority,
            updateBy: toDbId(ctx.userId),
            updateTime: new Date(),
          },
        });
        const verified = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: existing.id, delFlag: "0" },
          select: { id: true, taskName: true, priority: true },
        });
        if (!verified || verified.priority !== toPriority) {
          return { success: false, output: "", error: "优先级更新回查失败：数据库结果与预期不一致" };
        }
        return {
          success: true,
          output: `任务「${verified.taskName}」(ID: ${verified.id}) 优先级已更新为「${toTaskPriorityLabel(verified.priority)}」。`,
          metadata: buildMeta(startedAt),
        };
      }

      case "updateTaskDue": {
        const { taskId, toDue } = params as { taskId?: string; toDue?: string | null };
        if (!taskId) {
          return { success: false, output: "", error: "修改任务截止时间参数无效" };
        }
        const hasPermission = await canManageTask(ctx, taskId);
        if (!hasPermission) {
          return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
        }
        const existing = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
          select: { id: true, taskName: true, dueTime: true },
        });
        if (!existing) {
          return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
        }
        const dueAt = toDue ? parseLooseDate(String(toDue)) : null;
        if (toDue && !dueAt) {
          return { success: false, output: "", error: `截止时间格式无效：${toDue}` };
        }
        await prisma.task.update({
          where: { id: existing.id },
          data: {
            dueTime: dueAt,
            updateBy: toDbId(ctx.userId),
            updateTime: new Date(),
          },
        });
        const verified = await prisma.task.findFirst({
          where: { tenantId: ctx.tenantId, id: existing.id, delFlag: "0" },
          select: { id: true, taskName: true, dueTime: true },
        });
        const verifiedDue = verified?.dueTime ? verified.dueTime.toISOString().slice(0, 10) : null;
        const expectedDue = dueAt ? dueAt.toISOString().slice(0, 10) : null;
        if (!verified || verifiedDue !== expectedDue) {
          return { success: false, output: "", error: "截止时间更新回查失败：数据库结果与预期不一致" };
        }
        return {
          success: true,
          output: `任务「${verified.taskName}」(ID: ${verified.id}) 截止时间已更新为「${verifiedDue ?? "未设置"}」。`,
          metadata: buildMeta(startedAt),
        };
      }

      case "batchUpdateProjectTaskStatus": {
        const projectId = params?.projectId != null ? String(params.projectId) : "";
        const toStatus = params?.toStatus != null ? String(params.toStatus) : "";
        const rawIds = Array.isArray(params?.taskIds) ? params.taskIds : [];
        const taskIds = rawIds.map((v: unknown) => String(v)).filter((v: string) => /^\d+$/.test(v));
        if (!projectId || !/^\d+$/.test(projectId) || !["0", "1", "2", "3"].includes(toStatus)) {
          return { success: false, output: "", error: "批量修改状态参数无效" };
        }
        const project = await prisma.project.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(projectId), delFlag: "0" },
          select: { id: true, projectName: true },
        });
        if (!project) {
          return { success: false, output: "", error: "项目不存在或已删除" };
        }
        if (taskIds.length === 0) {
          return { success: false, output: "", error: "未选择要修改的任务" };
        }
        const rows = await prisma.task.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId: project.id,
            delFlag: "0",
            id: { in: taskIds.map((id: string) => toDbId(id)) },
          },
          select: { id: true, taskName: true, status: true },
        });
        const updatedNames: string[] = [];
        const skipped: string[] = [];
        for (const row of rows) {
          const idStr = String(row.id);
          if (!(await canManageTask(ctx, idStr))) {
            skipped.push(row.taskName ?? idStr);
            continue;
          }
          if (row.status === toStatus) {
            skipped.push(`${row.taskName ?? idStr}（已是目标状态）`);
            continue;
          }
          await prisma.task.update({
            where: { id: row.id },
            data: {
              status: toStatus,
              progress: toStatus === "2" ? "100" : undefined,
              finishTime: toStatus === "2" ? new Date() : null,
              updateBy: toDbId(ctx.userId),
              updateTime: new Date(),
            },
          });
          const verified = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: row.id, delFlag: "0" },
            select: { status: true, taskName: true },
          });
          if (!verified || verified.status !== toStatus) {
            return { success: false, output: "", error: `任务 ${idStr} 状态更新失败` };
          }
          updatedNames.push(verified.taskName ?? idStr);
        }
        const parts: string[] = [];
        if (updatedNames.length > 0) {
          parts.push(
            `已在项目「${project.projectName ?? projectId}」将 ${updatedNames.length} 条任务更新为「${toTaskStatus(toStatus)}」：${updatedNames.join("、")}。`,
          );
        }
        if (skipped.length > 0) {
          parts.push(`未修改：${skipped.join("、")}。`);
        }
        if (updatedNames.length === 0) {
          return {
            success: false,
            output: "",
            error: "没有任务被更新（可能无权限或列表已变化）",
          };
        }
        return {
          success: true,
          output: parts.join("\n"),
          metadata: buildMeta(startedAt),
        };
      }

      default:
        return { success: false, output: "", error: `未知的确认操作: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "确认操作执行失败",
    };
  }
}
