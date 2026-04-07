import { buildMeta } from "../../../core/ai.meta";
import { extractModifyTaskIntentTarget } from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function tryExplicitModifyIntent(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const { startedAt, question, pendingModifyKey } = s;

  const modifyIntentTarget = extractModifyTaskIntentTarget(question);
  if (modifyIntentTarget) {
    host.pendingTaskModifyTargetMap.set(pendingModifyKey, {
      raw: modifyIntentTarget.raw,
      coreName: modifyIntentTarget.coreName,
      requestedAt: Date.now(),
    });
    return {
      success: true,
      output:
        `好的，已定位到你要修改的任务「${modifyIntentTarget.coreName}」。\n` +
        `请告诉我要改哪一项：状态 / 优先级 / 截止时间。\n` +
        `例如：任务状态改成已完成。`,
      metadata: buildMeta(startedAt),
    };
  }
  return null;
}
