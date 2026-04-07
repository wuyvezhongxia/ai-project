import { buildMeta } from "../../../core/ai.meta";
import { toProjectStatus, toTaskStatus } from "../../../core/ai.domain-format";
import { normalizeTaskTitle } from "../../../core/ai.text-utils";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingInferred(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    ctx,
    pendingInferKey,
    pendingStructuredKey,
    pendingInferred,
    isExplicitOperation,
  } = s;
  if (!pendingInferred) return null;

    if (isExplicitOperation) {
      host.pendingInferredActionMap.delete(pendingInferKey);
    } else if (/^(确认|是|好的|没问题|ok|okay|确认创建)/i.test(question)) {
      if (pendingInferred.action === "createTask") {
        const created = await host.createTaskFromDraft(
          ctx,
          pendingInferred.bizId,
          { title: pendingInferred.title },
          pendingInferred.dueAt,
        );
        host.pendingInferredActionMap.delete(pendingInferKey);
        host.pendingStructuredInputMap.delete(pendingStructuredKey);
        return {
          success: true,
          output:
            `已按你的确认创建任务：\n` +
            `- ID: ${created.id}\n` +
            `- 标题: ${created.taskName}\n` +
            `- 状态: ${toTaskStatus(created.status)}\n` +
            `- 所属项目: ${created.projectName ?? "未归属项目"}\n` +
            `- 截止时间: ${pendingInferred.dueAt ? pendingInferred.dueAt.toISOString().slice(0, 10) : "未设置"}`,
          metadata: buildMeta(startedAt),
        };
      }
  
      const rawName = normalizeTaskTitle(pendingInferred.projectName);
      const projectName = rawName.replace(/[。！!？?]+$/g, "").trim();
      const created = await host.createProjectByName(ctx, projectName);
      host.pendingInferredActionMap.delete(pendingInferKey);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
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
          `已按你的确认创建项目：\n` +
          `- ID: ${created.id}\n` +
          `- 名称: ${created.projectName}\n` +
          `- 状态: ${toProjectStatus(created.status)}\n` +
          `- 当前进度: ${Number(created.progress ?? 0).toFixed(0)}%`,
        metadata: buildMeta(startedAt),
      };
    } else if (/^(取消|不用了|算了|否|不是)/.test(question)) {
      host.pendingInferredActionMap.delete(pendingInferKey);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      return {
        success: true,
        output: "已取消这次推断操作。你直接说具体动作，我马上执行。",
        metadata: buildMeta(startedAt),
      };
    } else {
      return {
        success: true,
        output: "我这边在等你确认：回复「确认」立即执行，或回复「取消」。",
        metadata: buildMeta(startedAt),
      };
    }
  return null;
}
