import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import { buildMeta } from "../../../core/ai.meta";
import { canManageTask } from "../../../core/ai.permissions";
import { parseLooseDate, toProjectStatus, toTaskStatus } from "../../../core/ai.domain-format";
import { normalizeTaskTitle } from "../../../core/ai.text-utils";
import {
  extractCreateTaskDraft,
  extractProjectNameReply,
  extractSubtaskDraft,
  extractTaskFormDraft,
  isTaskFormText,
} from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function tryExplicitCreateOperations(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    input,
    question,
    q,
    ctx,
    pendingKey,
    pendingProjectKey,
    pendingSubtaskKey,
    pendingStructuredKey,
    pendingStructured,
  } = s;

  if (isTaskFormText(question)) {
    const form = extractTaskFormDraft(question);
    if (!form.title) {
      return {
        success: true,
        output: "我识别到了任务表单，但缺少“标题”。请补充后我再创建。",
        metadata: buildMeta(startedAt),
      };
    }
    const created = await host.createTaskFromDraft(
      ctx,
      input.bizId,
      { title: form.title, projectName: form.projectName },
      form.dueAt,
    );
    return {
      success: true,
      output:
        `任务已创建成功：\n` +
        `- ID: ${created.id}\n` +
        `- 标题: ${created.taskName}\n` +
        `- 状态: ${toTaskStatus(created.status)}\n` +
        `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
        `- 截止时间: ${form.dueAt ? form.dueAt.toISOString().slice(0, 10) : "未设置"}`,
      metadata: buildMeta(startedAt),
    };
  }
  
  if (/^(?:请|帮我|麻烦|可以)?\s*(?:创建|新建|建立|添加)\s*项目\s*$/.test(q)) {
    if (pendingStructured?.first) {
      const created = await host.createProjectByName(ctx, pendingStructured.first);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      if (created.existed) {
        return {
          success: true,
          output: `已按你刚才提供的信息匹配到同名项目：${created.projectName}（ID: ${created.id}）。未重复创建。`,
          metadata: buildMeta(startedAt),
        };
      }
      return {
        success: true,
        output:
          `已按你刚才提供的信息创建项目：\n` +
          `- ID: ${created.id}\n` +
          `- 名称: ${created.projectName}\n` +
          `- 状态: ${toProjectStatus(created.status)}\n` +
          `- 当前进度: ${Number(created.progress ?? 0).toFixed(0)}%`,
        metadata: buildMeta(startedAt),
      };
    }
    host.pendingProjectCreateMap.set(pendingProjectKey, { requestedAt: Date.now() });
    return {
      success: true,
      output: "收到创建项目指令。请直接回复项目名称，例如：AICR 重构。",
      metadata: buildMeta(startedAt),
    };
  }
  if (/^(?:请|帮我|麻烦|可以)?\s*(?:创建|新建|建立|添加)\s*任务\s*$/.test(q)) {
    if (pendingStructured?.first) {
      if (!pendingStructured.dueAt) {
        host.pendingTaskCreateMap.set(pendingKey, {
          title: pendingStructured.first,
          projectName: undefined,
          bizId: input.bizId,
          requestedAt: Date.now(),
        });
        host.pendingStructuredInputMap.delete(pendingStructuredKey);
        return {
          success: true,
          output:
            `收到，我将按你刚才的信息创建任务「${pendingStructured.first}」。\n` +
            `请先确认截止时间：回复日期（例如 2026-08-18 / 20260818），或回复「无截止时间」。`,
          metadata: buildMeta(startedAt),
        };
      }
      const created = await host.createTaskFromDraft(
        ctx,
        input.bizId,
        { title: pendingStructured.first, projectName: undefined },
        pendingStructured.dueAt,
      );
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      return {
        success: true,
        output:
          `已按你刚才提供的信息创建任务：\n` +
          `- ID: ${created.id}\n` +
          `- 标题: ${created.taskName}\n` +
          `- 状态: ${toTaskStatus(created.status)}\n` +
          `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
          `- 截止时间: ${pendingStructured.dueAt.toISOString().slice(0, 10)}`,
        metadata: buildMeta(startedAt),
      };
    }
    host.pendingTaskCreateMap.set(pendingKey, {
      bizId: input.bizId,
      requestedAt: Date.now(),
    });
    return {
      success: true,
      output: "收到创建任务指令。请先回复任务标题，我会继续补齐项目和截止时间后为你创建。",
      metadata: buildMeta(startedAt),
    };
  }
  if (/^(?:请|帮我|麻烦|可以)?\s*(?:创建|新建|添加)\s*子任务\s*$/.test(q)) {
    host.pendingSubtaskCreateMap.set(pendingSubtaskKey, { requestedAt: Date.now() });
    return {
      success: true,
      output: "收到创建子任务指令。请直接回复“子任务标题, 父任务ID”，例如：编写接口文档, 123。",
      metadata: buildMeta(startedAt),
    };
  }
  // 1) 新建项目：支持「创建项目 AICR」和「创建AICR项目」
  const createProjectMatch =
    question.match(/(?:创建|新建|建立|添加).{0,8}项目(?:，|,|：|:)?(?:叫|名为|名称是)?\s*([^\n]+)/) ||
    question.match(/(?:创建|新建|建立|添加)\s*([^\n，,。]{1,40})\s*项目/);
  if (createProjectMatch) {
    const rawName = normalizeTaskTitle(createProjectMatch[1] ?? "");
    const projectName = rawName.replace(/[。！!？?]+$/g, "").trim();
    if (!projectName) {
      return {
        success: true,
        output: "收到创建项目指令。请补充项目名称（例如：创建项目 AICR 重构）。",
        metadata: buildMeta(startedAt),
      };
    }
    const created = await host.createProjectByName(ctx, projectName);
    if (created.existed) {
      return {
        success: true,
        output: `检测到同名项目已存在：${created.projectName}（ID: ${created.id}）。未重复创建。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    return {
      success: true,
      output:
        `项目已创建成功：\n` +
        `- ID: ${created.id}\n` +
        `- 名称: ${created.projectName}\n` +
        `- 状态: ${toProjectStatus(created.status)}\n` +
        `- 当前进度: ${Number(created.progress ?? 0).toFixed(0)}%`,
      metadata: buildMeta(startedAt),
    };
  }
  
  // 2) 新建任务：支持显式命令与信息型输入
  const createDraft = extractCreateTaskDraft(question);
  if (createDraft) {
    const title = createDraft.title;
    if (!title) {
      return { success: false, output: "", error: "任务标题为空，无法创建任务" };
    }
    // 按你要求：先确认时间，再创建
    if (!createDraft.dueAt) {
      host.pendingTaskCreateMap.set(pendingKey, {
        title,
        projectName: createDraft.projectName,
        bizId: input.bizId,
        requestedAt: Date.now(),
      });
      return {
        success: true,
        output:
          `收到，准备创建任务「${title}」。\n` +
          `请先确认截止时间：回复日期（例如 2026-08-18 / 20260818），` +
          `或回复「无截止时间」后我再正式创建。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const created = await host.createTaskFromDraft(
      ctx,
      input.bizId,
      { title, projectName: createDraft.projectName },
      createDraft.dueAt,
    );
    return {
      success: true,
      output:
        `任务已创建成功：\n` +
        `- ID: ${created.id}\n` +
        `- 标题: ${created.taskName}\n` +
        `- 状态: ${toTaskStatus(created.status)}\n` +
        `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
        `- 截止时间: ${createDraft.dueAt.toISOString().slice(0, 10)}`,
      metadata: buildMeta(startedAt),
    };
  }
  
  // 2.1) 新建子任务：例如「创建子任务 编写接口文档 到任务123」
  const subtaskStyleA = question.match(
    /(?:创建|新建|添加).{0,4}子任务(?:，|,|：|:)?\s*([^\n,，。]+?)(?:\s*(?:到|给|归属|属于|在).{0,3}任务\s*(\d+))?\s*$/,
  );
  const subtaskStyleB = question.match(
    /在任务\s*(\d+).{0,4}(?:创建|新建|添加).{0,4}子任务(?:，|,|：|:)?\s*([^\n,，。]+)\s*$/,
  );
  if (subtaskStyleA || subtaskStyleB) {
    const taskId = subtaskStyleA?.[2] || subtaskStyleB?.[1] || "";
    const subtaskName = normalizeTaskTitle(subtaskStyleA?.[1] || subtaskStyleB?.[2] || "");
  
    if (!subtaskName) {
      return { success: false, output: "", error: "子任务标题为空，无法创建子任务" };
    }
    if (!taskId) {
      return {
        success: true,
        output: `请补充父任务ID后我再创建子任务，例如：创建子任务 ${subtaskName} 到任务 123。`,
        metadata: buildMeta(startedAt),
      };
    }
    const hasPermission = await canManageTask(ctx, taskId);
    if (!hasPermission) {
      return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
    }
    const parentTask = await prisma.task.findFirst({
      where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
      select: { id: true, taskName: true },
    });
    if (!parentTask) {
      return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
    }
  
    const row = await prisma.subtask.create({
      data: {
        tenantId: ctx.tenantId,
        taskId: parentTask.id,
        subtaskName,
        status: "0",
        priority: "1",
        createBy: toDbId(ctx.userId),
        createTime: new Date(),
        delFlag: "0",
      },
      select: { id: true, subtaskName: true, taskId: true, status: true },
    });
  
    return {
      success: true,
      output:
        `子任务已创建成功：\n` +
        `- ID: ${row.id}\n` +
        `- 标题: ${row.subtaskName}\n` +
        `- 父任务: ${taskId}（${parentTask.taskName}）\n` +
        `- 状态: ${row.status === "1" ? "已完成" : row.status === "2" ? "已取消" : "待处理"}`,
      metadata: buildMeta(startedAt),
    };
  }
  return null;
}
