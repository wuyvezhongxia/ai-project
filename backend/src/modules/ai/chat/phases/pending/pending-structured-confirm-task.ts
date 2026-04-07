import { buildMeta } from "../../../core/ai.meta";
import { toTaskStatus } from "../../../core/ai.domain-format";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingStructuredConfirmTask(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    input,
    question,
    ctx,
    pendingKey,
    pendingInferKey,
    pendingStructuredKey,
    pendingStructured,
  } = s;
  if (!pendingStructured || !/^(确认|创建任务|新建任务|添加任务|创建一个任务|新建一个任务)/i.test(question)) {
    return null;
  }

    if (pendingStructured.dueAt) {
      const created = await host.createTaskFromDraft(
        ctx,
        input.bizId,
        { title: pendingStructured.first, projectName: undefined },
        pendingStructured.dueAt,
      );
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      host.pendingInferredActionMap.delete(pendingInferKey);
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
