import type { ChatTurnState } from "../../chat/chat-host";
import { chatTurnHasAnyPendingRecord } from "../llm-operation-intent";

/**
 * 供结构化路由 LLM 理解「当前有多轮 pending」，便于识别口语化确认/取消。
 */
export function buildPendingContextBlock(state: ChatTurnState): string | null {
  if (!chatTurnHasAnyPendingRecord(state)) return null;

  const lines: string[] = [];

  if (state.pendingConfirm) {
    lines.push(
      `- 待确认写操作：类型=${state.pendingConfirm.action}（用户可能在用口语表示同意或拒绝）`,
    );
  }
  if (state.pendingDeleteBatch?.taskIds?.length) {
    lines.push(`- 待批量删除任务：共 ${state.pendingDeleteBatch.taskIds.length} 条`);
  }
  if (state.pendingTaskDisambiguation?.candidates?.length) {
    lines.push(
      `- 待从多条任务中选择一条（当前 ${state.pendingTaskDisambiguation.candidates.length} 条候选）`,
    );
  }
  if (state.pendingCreate?.title) {
    lines.push(`- 待继续创建任务：标题「${state.pendingCreate.title}」`);
  } else if (state.pendingCreate) {
    lines.push(`- 待继续创建任务（信息未齐）`);
  }
  if (state.pendingProjectCreate) {
    lines.push(`- 待补充：创建项目的项目名称`);
  }
  if (state.pendingSubtaskCreate) {
    lines.push(`- 待继续：创建子任务`);
  }
  if (state.pendingStructured) {
    lines.push(`- 待结构化流程：已解析片段「${state.pendingStructured.first}」`);
  }
  if (state.pendingInferred) {
    lines.push(
      `- 待确认推断操作：${state.pendingInferred.action === "createTask" ? "创建任务" : "创建项目"}`,
    );
  }
  if (state.pendingModifyTarget && state.hasAlivePendingModify) {
    lines.push(`- 待修改任务：「${state.pendingModifyTarget.coreName}」（等待用户说改状态/优先级/截止）`);
  }

  if (lines.length === 0) {
    lines.push(`- 存在未完成的会话状态（多轮交互）`);
  }

  return `[PENDING_STATE]\n当前系统中仍有未完成的多轮交互，用户本条消息很可能是在回应其中一步：\n${lines.join("\n")}\n说明：若用户是在确认/同意执行，或拒绝/取消，应优先用 op=pending_resolve；若用户明确改做另一件无关的新指令，则按新指令解析。\n[/PENDING_STATE]`;
}
