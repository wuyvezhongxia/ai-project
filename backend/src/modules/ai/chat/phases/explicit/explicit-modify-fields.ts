import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import { buildMeta } from "../../../core/ai.meta";
import { canManageTask } from "../../../core/ai.permissions";
import { toTaskPriorityLabel, toTaskStatus } from "../../../core/ai.domain-format";
import {
  cleanQuotedText,
  levenshteinDistance,
  normalizeLooseText,
} from "../../../core/ai.text-utils";
import {
  extractBareDueChange,
  extractBarePriorityChange,
  extractBareStatusChange,
  extractMoveTaskToProjectTarget,
  extractUpdateTaskDueTarget,
  extractUpdateTaskPriorityTarget,
  extractUpdateTaskStatusTarget,
} from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type {
  AiResponse,
  UpdateTaskDueTarget,
  UpdateTaskPriorityTarget,
  UpdateTaskStatusTarget,
} from "../../../core/ai.types";

export async function tryExplicitModifyFields(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    ctx,
    pendingConfirmKey,
    pendingModifyKey,
    pendingModifyTarget,
    hasAlivePendingModify,
    scopedProjectId,
  } = s;

  // 5) 修改任务状态（支持按任务ID或任务名，并通过确认后执行）
  const statusTarget = extractUpdateTaskStatusTarget(question)
    ?? (hasAlivePendingModify
      ? (() => {
          const status = extractBareStatusChange(question);
          if (!status || !pendingModifyTarget) return null;
          return {
            raw: pendingModifyTarget.raw,
            coreName: pendingModifyTarget.coreName,
            status,
          } as UpdateTaskStatusTarget;
        })()
      : null);
  if (statusTarget) {
    const desiredStatus = statusTarget.status;
    const numericTarget = statusTarget.coreName.match(/^(\d+)$/);
  
    if (numericTarget) {
      const taskId = numericTarget[1]!;
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
      const confirmParams = {
        taskId,
        taskName: existing.taskName,
        fromStatus: existing.status,
        toStatus: desiredStatus,
        module: "task",
      };
      host.pendingConfirmActionMap.set(pendingConfirmKey, {
        action: "updateTaskStatus",
        params: confirmParams,
        requestedAt: Date.now(),
      });
      host.pendingTaskModifyTargetMap.delete(pendingModifyKey);
      return {
        success: true,
        output: `检测到修改状态请求：任务「${existing.taskName}」将变更为「${toTaskStatus(desiredStatus)}」。请确认是否执行。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "updateTaskStatus",
          params: confirmParams,
          message: `确定将任务「${existing.taskName}」状态改为「${toTaskStatus(desiredStatus)}」吗？`,
        },
        metadata: buildMeta(startedAt),
      };
    }
  
    const queryRows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
        taskName: { contains: statusTarget.coreName, mode: "insensitive" },
      },
      select: { id: true, taskName: true, status: true, projectId: true },
      orderBy: { id: "desc" },
      take: 20,
    });
    const projectIds = Array.from(new Set(queryRows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)));
    const projectRows =
      projectIds.length > 0
        ? await prisma.project.findMany({
            where: { tenantId: ctx.tenantId, id: { in: projectIds.map((id) => toDbId(id)) }, delFlag: "0" },
            select: { id: true, projectName: true },
          })
        : [];
    const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));
  
    const candidates: Array<{ id: string; taskName: string; status: string | null; projectName?: string }> = [];
    for (const row of queryRows) {
      const taskId = String(row.id);
      if (await canManageTask(ctx, taskId)) {
        candidates.push({
          id: taskId,
          taskName: row.taskName ?? "",
          status: row.status,
          projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
        });
      }
    }
  
    if (!candidates.length) {
      if (scopedProjectId) {
        const queryRowsAll = await prisma.task.findMany({
          where: {
            tenantId: ctx.tenantId,
            delFlag: "0",
            taskName: { contains: statusTarget.coreName, mode: "insensitive" },
          },
          select: { id: true, taskName: true, status: true, projectId: true },
          orderBy: { id: "desc" },
          take: 20,
        });
        const projectIdsAll = Array.from(
          new Set(queryRowsAll.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)),
        );
        const projectRowsAll =
          projectIdsAll.length > 0
            ? await prisma.project.findMany({
                where: { tenantId: ctx.tenantId, id: { in: projectIdsAll.map((id) => toDbId(id)) }, delFlag: "0" },
                select: { id: true, projectName: true },
              })
            : [];
        const projectNameMapAll = new Map(projectRowsAll.map((row) => [String(row.id), row.projectName ?? ""]));
  
        const candidatesAll: Array<{ id: string; taskName: string; status: string | null; projectName?: string }> = [];
        for (const row of queryRowsAll) {
          const taskId = String(row.id);
          if (await canManageTask(ctx, taskId)) {
            candidatesAll.push({
              id: taskId,
              taskName: row.taskName ?? "",
              status: row.status,
              projectName: row.projectId ? projectNameMapAll.get(String(row.projectId)) : undefined,
            });
          }
        }
  
        if (candidatesAll.length === 1) {
          const best = candidatesAll[0]!;
          const confirmParams = {
            taskId: best.id,
            taskName: best.taskName,
            fromStatus: best.status,
            toStatus: desiredStatus,
            projectName: best.projectName,
            module: "task",
          };
          host.pendingConfirmActionMap.set(pendingConfirmKey, {
            action: "updateTaskStatus",
            params: confirmParams,
            requestedAt: Date.now(),
          });
          host.pendingTaskModifyTargetMap.delete(pendingModifyKey);
          return {
            success: true,
            output:
              `当前关联项目下未找到该任务，已自动扩展到全部项目并命中：` +
              `任务「${best.taskName}」${best.projectName ? `（项目：${best.projectName}）` : ""}。\n` +
              `将变更为「${toTaskStatus(desiredStatus)}」，请确认是否执行。`,
            requiresConfirmation: true,
            confirmationData: {
              action: "updateTaskStatus",
              params: confirmParams,
              message: `确定将任务「${best.taskName}」状态改为「${toTaskStatus(desiredStatus)}」吗？`,
            },
            metadata: buildMeta(startedAt),
          };
        }
  
        if (candidatesAll.length > 1) {
          const optionText = candidatesAll
            .slice(0, 5)
            .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}）`)
            .join("\n");
          return {
            success: true,
            output:
              `当前关联项目下未找到该任务，我已扩展到全部项目，找到多个候选：\n` +
              `${optionText}\n` +
              `请回复更完整名称（可带项目），例如：将 ${candidatesAll[0]!.taskName}（${candidatesAll[0]!.projectName || "未归属项目"}）改为 ${toTaskStatus(desiredStatus)}。`,
            metadata: buildMeta(startedAt),
          };
        }
      }
      // 兜底：明确区分“确实不存在”与“存在但当前无权限操作”
      const existingRows = await prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          taskName: { contains: statusTarget.coreName, mode: "insensitive" },
        },
        select: { id: true, taskName: true, status: true, projectId: true },
        orderBy: { id: "desc" },
        take: 10,
      });
      if (existingRows.length > 0) {
        const projectIdsExist = Array.from(
          new Set(existingRows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)),
        );
        const projectRowsExist =
          projectIdsExist.length > 0
            ? await prisma.project.findMany({
                where: { tenantId: ctx.tenantId, id: { in: projectIdsExist.map((id) => toDbId(id)) }, delFlag: "0" },
                select: { id: true, projectName: true },
              })
            : [];
        const projectNameMapExist = new Map(projectRowsExist.map((row) => [String(row.id), row.projectName ?? ""]));
        const preview = existingRows
          .slice(0, 5)
          .map((row) => `- ${row.taskName}（${row.projectId ? projectNameMapExist.get(String(row.projectId)) || "未归属项目" : "未归属项目"}，${toTaskStatus(row.status)}）`)
          .join("\n");
        return {
          success: true,
          output:
            `我按实际数据查到了同名/近似任务，但你当前不可操作（可能是权限限制）。\n` +
            `${preview}\n` +
            `你可以改用可操作任务ID，或联系项目管理员授权后再试。`,
          metadata: buildMeta(startedAt),
        };
      }
      return {
        success: true,
        output:
          `没有找到可操作的任务「${statusTarget.raw}」${scopedProjectId ? "（已按当前关联项目范围检索）" : ""}。` +
          `请补充更完整任务名，或直接使用任务ID。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const normalizedCoreName = normalizeLooseText(statusTarget.coreName);
    const ranked = candidates
      .map((item) => {
        const normalizedTaskName = normalizeLooseText(item.taskName);
        let score = 0;
        if (normalizedTaskName === normalizedCoreName) score += 10;
        if (normalizedTaskName.startsWith(normalizedCoreName) || normalizedCoreName.startsWith(normalizedTaskName)) score += 6;
        if (normalizedTaskName.includes(normalizedCoreName) || normalizedCoreName.includes(normalizedTaskName)) score += 4;
        const distance = levenshteinDistance(normalizedTaskName, normalizedCoreName);
        if (distance <= 2) score += 4 - distance;
        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
  
    if (best && best.score > 0 && ranked.filter((item) => item.score === best.score).length === 1) {
      const confirmParams = {
        taskId: best.id,
        taskName: best.taskName,
        fromStatus: best.status,
        toStatus: desiredStatus,
        projectName: best.projectName,
        module: "task",
      };
      host.pendingConfirmActionMap.set(pendingConfirmKey, {
        action: "updateTaskStatus",
        params: confirmParams,
        requestedAt: Date.now(),
      });
      host.pendingTaskModifyTargetMap.delete(pendingModifyKey);
      return {
        success: true,
        output:
          `检测到修改状态请求：任务「${best.taskName}」${best.projectName ? `（项目：${best.projectName}）` : ""}将变更为「${toTaskStatus(desiredStatus)}」。请确认是否执行。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "updateTaskStatus",
          params: confirmParams,
          message: `确定将任务「${best.taskName}」状态改为「${toTaskStatus(desiredStatus)}」吗？`,
        },
        metadata: buildMeta(startedAt),
      };
    }
  
    const optionText = ranked
      .slice(0, 5)
      .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}）`)
      .join("\n");
    return {
      success: true,
      output:
        `我找到了多个可能匹配「${statusTarget.raw}」的任务，请先确认具体目标：\n` +
        `${optionText}\n` +
        `请回复更完整名称（可带项目），例如：将 ${ranked[0]!.taskName} 任务改为 ${toTaskStatus(desiredStatus)}。`,
      metadata: buildMeta(startedAt),
    };
  }
  
  // 5.0.1) 修改任务优先级
  const priorityTarget = extractUpdateTaskPriorityTarget(question)
    ?? (hasAlivePendingModify
      ? (() => {
          const priority = extractBarePriorityChange(question);
          if (!priority || !pendingModifyTarget) return null;
          return {
            raw: pendingModifyTarget.raw,
            coreName: pendingModifyTarget.coreName,
            priority,
          } as UpdateTaskPriorityTarget;
        })()
      : null);
  if (priorityTarget) {
    const desiredPriority = priorityTarget.priority;
    const queryRows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
        taskName: { contains: priorityTarget.coreName, mode: "insensitive" },
      },
      select: { id: true, taskName: true, status: true, priority: true, projectId: true },
      orderBy: { id: "desc" },
      take: 20,
    });
    const projectIds = Array.from(new Set(queryRows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)));
    const projectRows =
      projectIds.length > 0
        ? await prisma.project.findMany({
            where: { tenantId: ctx.tenantId, id: { in: projectIds.map((id) => toDbId(id)) }, delFlag: "0" },
            select: { id: true, projectName: true },
          })
        : [];
    const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));
  
    const candidates: Array<{ id: string; taskName: string; status: string | null; priority: string | null; projectName?: string }> = [];
    for (const row of queryRows) {
      const taskId = String(row.id);
      if (await canManageTask(ctx, taskId)) {
        candidates.push({
          id: taskId,
          taskName: row.taskName ?? "",
          status: row.status,
          priority: row.priority,
          projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
        });
      }
    }
    if (!candidates.length) {
      return {
        success: true,
        output:
          `没有找到可操作的任务「${priorityTarget.raw}」${scopedProjectId ? "（已按当前关联项目范围检索）" : ""}。` +
          `请补充更完整任务名，或直接使用任务ID。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const normalizedCoreName = cleanQuotedText(priorityTarget.coreName).toLowerCase();
    const exactResolved = candidates.filter((item) => cleanQuotedText(item.taskName).toLowerCase() === normalizedCoreName);
    const target = exactResolved.length === 1 ? exactResolved[0]! : null;
    const bestTarget =
      target ??
      candidates
        .map((item) => {
          const normalizedTaskName = normalizeLooseText(item.taskName);
          const normalizedTarget = normalizeLooseText(priorityTarget.coreName);
          let score = 0;
          if (normalizedTaskName === normalizedTarget) score += 10;
          if (normalizedTaskName.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedTaskName)) score += 6;
          if (normalizedTaskName.includes(normalizedTarget) || normalizedTarget.includes(normalizedTaskName)) score += 4;
          const distance = levenshteinDistance(normalizedTaskName, normalizedTarget);
          if (distance <= 2) score += 4 - distance;
          return { ...item, score };
        })
        .sort((a, b) => b.score - a.score)[0];
    if (!bestTarget || (bestTarget as { score?: number }).score === 0) {
      return {
        success: true,
        output:
          `没有找到可操作的任务「${priorityTarget.raw}」${scopedProjectId ? "（已按当前关联项目范围检索）" : ""}。` +
          `请补充更完整任务名，或直接使用任务ID。`,
        metadata: buildMeta(startedAt),
      };
    }
    const tied = target ? 1 : candidates.filter((item) => {
      const s1 = normalizeLooseText(item.taskName);
      const s2 = normalizeLooseText(priorityTarget.coreName);
      let score = 0;
      if (s1 === s2) score += 10;
      if (s1.startsWith(s2) || s2.startsWith(s1)) score += 6;
      if (s1.includes(s2) || s2.includes(s1)) score += 4;
      const distance = levenshteinDistance(s1, s2);
      if (distance <= 2) score += 4 - distance;
      return score === (bestTarget as { score?: number }).score;
    }).length;
    if (!target && tied > 1) {
      const optionText = candidates
        .slice(0, 5)
        .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}，${toTaskPriorityLabel(item.priority)}）`)
        .join("\n");
      return {
        success: true,
        output: `我找到了多个可能匹配「${priorityTarget.raw}」的任务，请确认具体目标：\n${optionText}`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const resolvedTarget = target ?? (bestTarget as { id: string; taskName: string; status: string | null; priority: string | null; projectName?: string });
    const confirmParams = {
      taskId: resolvedTarget.id,
      taskName: resolvedTarget.taskName,
      fromPriority: resolvedTarget.priority,
      toPriority: desiredPriority,
      projectName: resolvedTarget.projectName,
      module: "task",
    };
    host.pendingConfirmActionMap.set(pendingConfirmKey, {
      action: "updateTaskPriority",
      params: confirmParams,
      requestedAt: Date.now(),
    });
    host.pendingTaskModifyTargetMap.delete(pendingModifyKey);
    return {
      success: true,
      output: `检测到修改优先级请求：任务「${resolvedTarget.taskName}」${resolvedTarget.projectName ? `（项目：${resolvedTarget.projectName}）` : ""}将变更为「${toTaskPriorityLabel(desiredPriority)}」。请确认是否执行。`,
      requiresConfirmation: true,
      confirmationData: {
        action: "updateTaskPriority",
        params: confirmParams,
        message: `确定将任务「${resolvedTarget.taskName}」优先级改为「${toTaskPriorityLabel(desiredPriority)}」吗？`,
      },
      metadata: buildMeta(startedAt),
    };
  }
  
  // 5.0.2) 修改任务截止时间
  const dueTarget = extractUpdateTaskDueTarget(question)
    ?? (hasAlivePendingModify
      ? (() => {
          const dueAt = extractBareDueChange(question);
          if (dueAt === undefined || !pendingModifyTarget) return null;
          return {
            raw: pendingModifyTarget.raw,
            coreName: pendingModifyTarget.coreName,
            dueAt,
          } as UpdateTaskDueTarget;
        })()
      : null);
  if (dueTarget) {
    const queryRows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
        taskName: { contains: dueTarget.coreName, mode: "insensitive" },
      },
      select: { id: true, taskName: true, status: true, dueTime: true, projectId: true },
      orderBy: { id: "desc" },
      take: 20,
    });
    const projectIds = Array.from(new Set(queryRows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)));
    const projectRows =
      projectIds.length > 0
        ? await prisma.project.findMany({
            where: { tenantId: ctx.tenantId, id: { in: projectIds.map((id) => toDbId(id)) }, delFlag: "0" },
            select: { id: true, projectName: true },
          })
        : [];
    const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));
    const candidates: Array<{ id: string; taskName: string; status: string | null; dueTime: Date | null; projectName?: string }> = [];
    for (const row of queryRows) {
      const taskId = String(row.id);
      if (await canManageTask(ctx, taskId)) {
        candidates.push({
          id: taskId,
          taskName: row.taskName ?? "",
          status: row.status,
          dueTime: row.dueTime,
          projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
        });
      }
    }
    if (!candidates.length) {
      return {
        success: true,
        output:
          `没有找到可操作的任务「${dueTarget.raw}」${scopedProjectId ? "（已按当前关联项目范围检索）" : ""}。` +
          `请补充更完整任务名，或直接使用任务ID。`,
        metadata: buildMeta(startedAt),
      };
    }
    const normalizedCoreName = cleanQuotedText(dueTarget.coreName).toLowerCase();
    const exactResolved = candidates.filter((item) => cleanQuotedText(item.taskName).toLowerCase() === normalizedCoreName);
    const resolvedTarget = exactResolved.length === 1 ? exactResolved[0]! : candidates[0]!;
    if (exactResolved.length !== 1 && candidates.length > 1) {
      const optionText = candidates
        .slice(0, 5)
        .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}）`)
        .join("\n");
      return {
        success: true,
        output: `我找到了多个可能匹配「${dueTarget.raw}」的任务，请确认具体目标：\n${optionText}`,
        metadata: buildMeta(startedAt),
      };
    }
    const confirmParams = {
      taskId: resolvedTarget.id,
      taskName: resolvedTarget.taskName,
      fromDue: resolvedTarget.dueTime ? resolvedTarget.dueTime.toISOString().slice(0, 10) : null,
      toDue: dueTarget.dueAt ? dueTarget.dueAt.toISOString().slice(0, 10) : null,
      projectName: resolvedTarget.projectName,
      module: "task",
    };
    host.pendingConfirmActionMap.set(pendingConfirmKey, {
      action: "updateTaskDue",
      params: confirmParams,
      requestedAt: Date.now(),
    });
    host.pendingTaskModifyTargetMap.delete(pendingModifyKey);
    return {
      success: true,
      output: `检测到修改截止时间请求：任务「${resolvedTarget.taskName}」${resolvedTarget.projectName ? `（项目：${resolvedTarget.projectName}）` : ""}将变更为「${confirmParams.toDue ?? "未设置"}」。请确认是否执行。`,
      requiresConfirmation: true,
      confirmationData: {
        action: "updateTaskDue",
        params: confirmParams,
        message: `确定将任务「${resolvedTarget.taskName}」截止时间改为「${confirmParams.toDue ?? "未设置"}」吗？`,
      },
      metadata: buildMeta(startedAt),
    };
  }
  
  // 5.1) 移动任务到项目
  const moveTarget = extractMoveTaskToProjectTarget(question);
  if (moveTarget) {
    const taskRows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        taskName: { contains: moveTarget.taskCoreName, mode: "insensitive" },
      },
      select: { id: true, taskName: true, projectId: true },
      orderBy: { id: "desc" },
      take: 10,
    });
  
    const taskCandidates: Array<{ id: string; taskName: string }> = [];
    for (const row of taskRows) {
      const taskId = String(row.id);
      if (!(await canManageTask(ctx, taskId))) continue;
      taskCandidates.push({ id: taskId, taskName: row.taskName ?? "" });
    }
  
    const exactTask = taskCandidates.find(
      (item) => cleanQuotedText(item.taskName).toLowerCase() === moveTarget.taskCoreName.toLowerCase(),
    );
    const targetTask = exactTask ?? (taskCandidates.length === 1 ? taskCandidates[0] : null);
    if (!targetTask) {
      if (!taskCandidates.length) {
        return {
          success: true,
          output: `我没有找到可操作的任务「${moveTarget.taskRaw}」。请回复更完整的任务名。`,
          metadata: buildMeta(startedAt),
        };
      }
      return {
        success: true,
        output:
          `我找到了多个可能匹配「${moveTarget.taskRaw}」的任务：\n` +
          taskCandidates.map((item) => `- ${item.taskName}（ID: ${item.id}）`).join("\n") +
          `\n请回复完整任务名后我再移动。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const project = await host.resolveProject(ctx, undefined, moveTarget.projectCoreName);
    if (!project) {
      return {
        success: true,
        output: `我没有找到项目「${moveTarget.projectRaw}」。请回复更完整的项目名称。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const updated = await prisma.task.update({
      where: { id: toDbId(targetTask.id) },
      data: {
        projectId: project.id,
        updateBy: toDbId(ctx.userId),
        updateTime: new Date(),
      },
      select: { id: true, taskName: true, projectId: true },
    });
  
    return {
      success: true,
      output:
        `任务已移动成功：\n` +
        `- ID: ${updated.id}\n` +
        `- 标题: ${updated.taskName}\n` +
        `- 新项目: ${project.projectName}`,
      metadata: buildMeta(startedAt),
    };
  }
  return null;
}
