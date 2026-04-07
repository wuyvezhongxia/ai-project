import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import { buildMeta } from "../../../core/ai.meta";
import { canManageTask } from "../../../core/ai.permissions";
import { toTaskStatus } from "../../../core/ai.domain-format";
import { cleanQuotedText, levenshteinDistance, normalizeLooseText } from "../../../core/ai.text-utils";
import { extractViewTaskDetailTarget } from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function tryExplicitViewDetail(
  _host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const { startedAt, question, ctx, scopedProjectId } = s;

  // 6) 查询任务详情（支持任务ID与任务名）
  const detailTarget = extractViewTaskDetailTarget(question);
  if (detailTarget) {
    const numericTarget = detailTarget.coreName.match(/^(\d+)$/);
  
    const renderTaskDetail = async (task: {
      id: bigint;
      taskName: string | null;
      status: string | null;
      priority: string | null;
      progress: any;
      dueTime: Date | null;
      projectId: bigint | null;
    }) => {
      const project = task.projectId
        ? await prisma.project.findFirst({
            where: { tenantId: ctx.tenantId, id: task.projectId, delFlag: "0" },
            select: { projectName: true },
          })
        : null;
      return `任务详情：
  - ID: ${task.id}
  - 标题: ${task.taskName}
  - 状态: ${toTaskStatus(task.status)}
  - 优先级: ${task.priority ?? "未设置"}
  - 进度: ${Number(task.progress ?? 0).toFixed(0)}%
  - 截止时间: ${task.dueTime?.toISOString().slice(0, 10) ?? "未设置"}
  - 所属项目: ${project?.projectName ?? "未归属项目"}`;
    };
  
    if (numericTarget) {
      const taskId = numericTarget[1]!;
      const hasPermission = await canManageTask(ctx, taskId);
      if (!hasPermission) {
        return { success: false, output: "", error: `你没有任务 ${taskId} 的访问权限` };
      }
      const task = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
        select: { id: true, taskName: true, status: true, priority: true, progress: true, dueTime: true, projectId: true },
      });
      if (!task) {
        return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
      }
      return {
        success: true,
        output: await renderTaskDetail(task),
        metadata: buildMeta(startedAt),
      };
    }
  
    const rows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
        taskName: { contains: detailTarget.coreName, mode: "insensitive" },
      },
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
      take: 20,
    });
    const projectIds = Array.from(new Set(rows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)));
    const projectRows =
      projectIds.length > 0
        ? await prisma.project.findMany({
            where: { tenantId: ctx.tenantId, id: { in: projectIds.map((id) => toDbId(id)) }, delFlag: "0" },
            select: { id: true, projectName: true },
          })
        : [];
    const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));
  
    const candidates: Array<{
      id: string;
      taskName: string;
      status: string | null;
      priority: string | null;
      progress: any;
      dueTime: Date | null;
      projectId?: string;
      projectName?: string;
    }> = [];
    for (const row of rows) {
      const taskId = String(row.id);
      if (!(await canManageTask(ctx, taskId))) continue;
      candidates.push({
        id: taskId,
        taskName: row.taskName ?? "",
        status: row.status,
        priority: row.priority,
        progress: row.progress,
        dueTime: row.dueTime,
        projectId: row.projectId ? String(row.projectId) : undefined,
        projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
      });
    }
  
    if (!candidates.length) {
      return {
        success: true,
        output:
          `没有找到可访问的任务「${detailTarget.raw}」${scopedProjectId ? "（已按当前关联项目范围检索）" : ""}。` +
          `请补充更完整任务名或任务ID。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const normalizedCoreName = cleanQuotedText(detailTarget.coreName).toLowerCase();
    const exactResolved = candidates.filter((item) => cleanQuotedText(item.taskName).toLowerCase() === normalizedCoreName);
    if (exactResolved.length === 1) {
      const target = exactResolved[0]!;
      return {
        success: true,
        output: await renderTaskDetail({
          id: toDbId(target.id),
          taskName: target.taskName,
          status: target.status,
          priority: target.priority,
          progress: target.progress,
          dueTime: target.dueTime,
          projectId: target.projectId ? toDbId(target.projectId) : null,
        }),
        metadata: buildMeta(startedAt),
      };
    }
  
    const ranked = candidates
      .map((item) => {
        const normalizedTaskName = normalizeLooseText(item.taskName);
        const normalizedTarget = normalizeLooseText(detailTarget.coreName);
        let score = 0;
        if (normalizedTaskName === normalizedTarget) score += 10;
        if (normalizedTaskName.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedTaskName)) score += 6;
        if (normalizedTaskName.includes(normalizedTarget) || normalizedTarget.includes(normalizedTaskName)) score += 4;
        const distance = levenshteinDistance(normalizedTaskName, normalizedTarget);
        if (distance <= 2) score += 4 - distance;
        if (detailTarget.projectHint && item.projectName?.toLowerCase().includes(detailTarget.projectHint.toLowerCase())) score += 2;
        if (detailTarget.statusHint && toTaskStatus(item.status).includes(detailTarget.statusHint.replace("完成", "已完成"))) score += 2;
        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score);
    if (ranked.length > 0 && ranked[0]!.score > 0 && ranked.filter((item) => item.score === ranked[0]!.score).length === 1) {
      const target = ranked[0]!;
      return {
        success: true,
        output: await renderTaskDetail({
          id: toDbId(target.id),
          taskName: target.taskName,
          status: target.status,
          priority: target.priority,
          progress: target.progress,
          dueTime: target.dueTime,
          projectId: target.projectId ? toDbId(target.projectId) : null,
        }),
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
        `我找到了多个可能匹配「${detailTarget.raw}」的任务，请确认具体目标：\n` +
        `${optionText}\n` +
        `请回复更完整名称，例如「查看 ${ranked[0]!.taskName}（${ranked[0]!.projectName || "未归属项目"}，${toTaskStatus(ranked[0]!.status)}）」。`,
      metadata: buildMeta(startedAt),
    };
  }
  return null;
}
