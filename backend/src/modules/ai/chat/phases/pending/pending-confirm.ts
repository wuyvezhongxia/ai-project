import { buildMeta } from "../../../core/ai.meta";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingConfirm(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    pendingConfirmKey,
    pendingConfirm,
    isExplicitOperation,
    ctx,
  } = s;
  if (!pendingConfirm) return null;

    const isExpired = Date.now() - pendingConfirm.requestedAt > 10 * 60 * 1000;
    const normalized = question.replace(/\s+/g, "").toLowerCase();
    if (isExpired) {
      host.pendingConfirmActionMap.delete(pendingConfirmKey);
    } else if (/^(继续|确认|确定|是|好的|好|ok|okay|yes)$/.test(normalized)) {
      host.pendingConfirmActionMap.delete(pendingConfirmKey);
      return host.confirmAction(pendingConfirm.action, pendingConfirm.params, ctx);
    } else if (/^(取消|算了|不执行|先不|no|nope)$/.test(normalized)) {
      host.pendingConfirmActionMap.delete(pendingConfirmKey);
      return {
        success: true,
        output: "已取消本次修改操作。",
        metadata: buildMeta(startedAt),
      };
    } else if (!isExplicitOperation) {
      return {
        success: true,
        output: "当前有待确认的修改操作。回复「确认/继续」执行，或回复「取消」。",
        metadata: buildMeta(startedAt),
      };
    }
  return null;
}
