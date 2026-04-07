import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import { buildMeta } from "../../../core/ai.meta";
import { canManageTask } from "../../../core/ai.permissions";
import { extractSubtaskDraft } from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingSubtaskCreate(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    q,
    ctx,
    pendingSubtaskKey,
    pendingSubtaskCreate,
    isExplicitOperation,
  } = s;
  if (!pendingSubtaskCreate) return null;

    if (/^(取消|算了|不用了|先不创建)/.test(question)) {
      host.pendingSubtaskCreateMap.delete(pendingSubtaskKey);
      return {
        success: true,
        output: "已取消本次子任务创建。需要时你再告诉我。",
        metadata: buildMeta(startedAt),
      };
    }
  
    if (isExplicitOperation && !/(?:创建|新建|添加)\s*子任务/.test(q)) {
      host.pendingSubtaskCreateMap.delete(pendingSubtaskKey);
    } else {
      const draft = extractSubtaskDraft(question);
      if (!draft.title || !draft.taskId) {
        return {
          success: true,
          output: "我还缺子任务标题或父任务ID。直接回复“子任务标题, 任务ID”即可，例如：编写接口文档, 123。",
          metadata: buildMeta(startedAt),
        };
      }
  
      const hasPermission = await canManageTask(ctx, draft.taskId);
      if (!hasPermission) {
        return { success: false, output: "", error: `你没有任务 ${draft.taskId} 的操作权限` };
      }
      const parentTask = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(draft.taskId), delFlag: "0" },
        select: { id: true, taskName: true },
      });
      if (!parentTask) {
        return { success: false, output: "", error: `任务 ${draft.taskId} 不存在或已删除` };
      }
      const row = await prisma.subtask.create({
        data: {
          tenantId: ctx.tenantId,
          taskId: parentTask.id,
          subtaskName: draft.title,
          status: "0",
          priority: "1",
          createBy: toDbId(ctx.userId),
          createTime: new Date(),
          delFlag: "0",
        },
        select: { id: true, subtaskName: true, taskId: true, status: true },
      });
      host.pendingSubtaskCreateMap.delete(pendingSubtaskKey);
      return {
        success: true,
        output:
          `子任务已创建成功：\n` +
          `- ID: ${row.id}\n` +
          `- 标题: ${row.subtaskName}\n` +
          `- 父任务: ${draft.taskId}（${parentTask.taskName}）\n` +
          `- 状态: ${row.status === "1" ? "已完成" : row.status === "2" ? "已取消" : "待处理"}`,
        metadata: buildMeta(startedAt),
      };
    }
  return null;
}
