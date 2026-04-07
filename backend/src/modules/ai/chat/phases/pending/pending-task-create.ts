import { buildMeta } from "../../../core/ai.meta";
import { parseLooseDate, toTaskStatus } from "../../../core/ai.domain-format";
import { normalizeTaskTitle } from "../../../core/ai.text-utils";
import { extractProjectNameReply } from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse, PendingTaskCreate } from "../../../core/ai.types";

export async function handlePendingTaskCreate(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    ctx,
    pendingKey,
    pendingStructuredKey,
    pendingCreate,
  } = s;
  if (!pendingCreate) return null;

    if (/^(取消|算了|不用了|先不创建)/.test(question)) {
      host.pendingTaskCreateMap.delete(pendingKey);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      return {
        success: true,
        output: `已取消创建任务${pendingCreate.title ? `「${pendingCreate.title}」` : ""}。如果需要，随时告诉我重新创建。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    if (!pendingCreate.title) {
      const title = normalizeTaskTitle(question);
      if (!title || /^(?:创建|新建|建立|添加)\s*任务$/.test(title)) {
        return {
          success: true,
          output: "我先需要任务标题。你直接回复标题即可，例如：修复登录页样式。",
          metadata: buildMeta(startedAt),
        };
      }
  
      const nextPending: PendingTaskCreate = {
        ...pendingCreate,
        title,
      };
      host.pendingTaskCreateMap.set(pendingKey, nextPending);
  
      if (pendingCreate.bizId || pendingCreate.projectName) {
        return {
          success: true,
          output:
            `已记住任务标题「${title}」。\n` +
            `请再告诉我截止时间：回复日期（例如 2026-08-18 / 20260818），或回复「无截止时间」。`,
          metadata: buildMeta(startedAt),
        };
      }
  
      return {
        success: true,
        output:
          `已记住任务标题「${title}」。\n` +
          `请告诉我所属项目名称；如果不归属任何项目，回复「无项目」。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    if (!pendingCreate.bizId && !pendingCreate.projectName) {
      const noProject = /无项目|不关联项目|不属于项目|独立任务/.test(question);
      const dueAtCandidate = parseLooseDate(question);
      const noDueCandidate = /无截止时间|不设置截止|不需要截止|无截止|不设置/.test(question);
  
      if (!dueAtCandidate && !noDueCandidate && !noProject) {
        const projectName = extractProjectNameReply(question);
        if (projectName) {
          const project = await host.resolveProject(ctx, undefined, projectName);
          if (!project) {
            return {
              success: true,
              output:
                `没有找到项目「${projectName}」，所以我还没有创建任务。\n` +
                `请回复真实存在的项目名称，或回复「无项目」。`,
              metadata: buildMeta(startedAt),
            };
          }
          host.pendingTaskCreateMap.set(pendingKey, {
            ...pendingCreate,
            bizId: String(project.id),
            projectName: project.projectName,
          });
          return {
            success: true,
            output:
              `已关联项目「${project.projectName}」。\n` +
              `请再告诉我截止时间：回复日期（例如 2026-08-18 / 20260818），或回复「无截止时间」。`,
            metadata: buildMeta(startedAt),
          };
        }
      }
  
      if (!dueAtCandidate && !noDueCandidate) {
        return {
          success: true,
          output: "我还需要所属项目名称；如果不归属任何项目，回复「无项目」。",
          metadata: buildMeta(startedAt),
        };
      }
    }
  
    const dueAt = parseLooseDate(question);
    const noDue = /无截止时间|不设置截止|不需要截止|无截止|不设置/.test(question);
    if (!dueAt && !noDue) {
      return {
        success: true,
        output:
          `我还在等你确认任务「${pendingCreate.title}」的截止时间。\n` +
          `请回复日期（例如 2026-08-18 / 20260818），或回复「无截止时间」。`,
        metadata: buildMeta(startedAt),
      };
    }
  
    const created = await host.createTaskFromDraft(
      ctx,
      pendingCreate.bizId,
      { title: pendingCreate.title, projectName: pendingCreate.projectName },
      dueAt ?? undefined,
    );
    host.pendingTaskCreateMap.delete(pendingKey);
    host.pendingStructuredInputMap.delete(pendingStructuredKey);
    return {
      success: true,
      output:
        `任务已创建成功：\n` +
        `- ID: ${created.id}\n` +
        `- 标题: ${created.taskName}\n` +
        `- 状态: ${toTaskStatus(created.status)}\n` +
        `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
        `- 截止时间: ${dueAt ? dueAt.toISOString().slice(0, 10) : "未设置"}`,
      metadata: buildMeta(startedAt),
    };
}
