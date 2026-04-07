import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import { buildMeta } from "../../../core/ai.meta";
import { canManageTask } from "../../../core/ai.permissions";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingDeleteBatch(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const { startedAt, question, pendingDeleteBatchKey, pendingDeleteBatch, ctx } = s;
  if (!pendingDeleteBatch) return null;

    const isExpired = Date.now() - pendingDeleteBatch.requestedAt > 10 * 60 * 1000;
    const normalized = question.replace(/\s+/g, "");
    if (/^(取消|算了|不删了|先不删)/.test(question) || /^(取消|不删)$/.test(normalized)) {
      host.pendingDeleteTaskBatchMap.delete(pendingDeleteBatchKey);
      return {
        success: true,
        output: "已取消批量删除。",
        metadata: buildMeta(startedAt),
      };
    }
    if (!isExpired && /^(都删除|全部删除|全删|确认删除|确认|删除|是|确定)$/.test(normalized)) {
      const aliveRows = await prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          id: { in: pendingDeleteBatch.taskIds.map((id) => toDbId(id)) },
        },
        select: { id: true, taskName: true },
      });
      const manageable: Array<{ id: bigint; taskName: string }> = [];
      for (const row of aliveRows) {
        const taskId = String(row.id);
        if (await canManageTask(ctx, taskId)) {
          manageable.push({ id: row.id, taskName: row.taskName ?? taskId });
        }
      }
      host.pendingDeleteTaskBatchMap.delete(pendingDeleteBatchKey);
      if (manageable.length === 0) {
        return {
          success: false,
          output: "",
          error: "可删除任务为空：这些任务可能已被删除或你没有权限",
        };
      }
      return {
        success: true,
        output: `检测到批量删除请求：${manageable.map((r) => r.taskName).join("、")}。请确认是否删除。`,
        requiresConfirmation: true,
        confirmationData: {
          action: "deleteTasks",
          params: {
            taskIds: manageable.map((r) => String(r.id)),
            taskNames: manageable.map((r) => r.taskName),
            module: "task",
          },
          message: `确定要删除这 ${manageable.length} 个任务吗？此操作无法撤销。`,
        },
        metadata: buildMeta(startedAt),
      };
    }
    if (isExpired) {
      host.pendingDeleteTaskBatchMap.delete(pendingDeleteBatchKey);
    }
  return null;
}
