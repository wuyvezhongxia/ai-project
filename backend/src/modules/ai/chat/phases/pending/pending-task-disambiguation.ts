import { buildMeta } from "../../../core/ai.meta";
import { aiPendingKey } from "../../../service/pending-keys";
import { executePickedTaskDisambiguation } from "../../../service/structured-router/task-conditions-execute";
import { parseTaskDisambiguationReply } from "../../../service/structured-router/task-disambiguation-parse";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingTaskDisambiguation(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const { startedAt, question, ctx, pendingTaskDisambiguation } = s;
  if (!pendingTaskDisambiguation) return null;

  const key = aiPendingKey(ctx);
  const isExpired = Date.now() - pendingTaskDisambiguation.requestedAt > 10 * 60 * 1000;
  if (isExpired) {
    host.pendingTaskDisambiguationMap.delete(key);
    return {
      success: true,
      output: "任务选择已过期，请重新发起删除、查询或修改指令。",
      metadata: buildMeta(startedAt),
    };
  }

  const parsed = parseTaskDisambiguationReply(question, pendingTaskDisambiguation.candidates);
  if (!parsed) {
    return {
      success: true,
      output:
        "请从列表中回复序号（如「1」「第一个」）或任务的完整标题；删除场景可回复「都删除」。也可回复「取消」结束。",
      metadata: buildMeta(startedAt),
    };
  }

  if (parsed.kind === "cancel") {
    host.pendingTaskDisambiguationMap.delete(key);
    return { success: true, output: "已取消选择。", metadata: buildMeta(startedAt) };
  }

  if (parsed.kind === "batch_delete") {
    if (pendingTaskDisambiguation.op !== "delete_task") {
      return {
        success: true,
        output: "当前步骤不支持批量操作，请指定一条任务（序号或完整标题）。",
        metadata: buildMeta(startedAt),
      };
    }
    host.pendingTaskDisambiguationMap.delete(key);
    host.pendingDeleteTaskBatchMap.set(s.pendingDeleteBatchKey, {
      taskIds: pendingTaskDisambiguation.candidates.map((c) => c.id),
      taskNames: pendingTaskDisambiguation.candidates.map((c) => c.taskName),
      requestedAt: Date.now(),
    });
    const lines = pendingTaskDisambiguation.candidates
      .map((c, i) => `${i + 1}. ${c.taskName}`)
      .join("\n");
    return {
      success: true,
      output: `将对以下 ${pendingTaskDisambiguation.candidates.length} 个任务发起批量删除：\n${lines}\n请回复「都删除」或「确认」继续（与原有批量删除确认流程一致）。`,
      metadata: buildMeta(startedAt),
    };
  }

  host.pendingTaskDisambiguationMap.delete(key);
  return executePickedTaskDisambiguation(host, s, pendingTaskDisambiguation, parsed.id);
}
