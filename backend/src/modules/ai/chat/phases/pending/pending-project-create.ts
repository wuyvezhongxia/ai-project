import { buildMeta } from "../../../core/ai.meta";
import { toProjectStatus } from "../../../core/ai.domain-format";
import { normalizeTaskTitle } from "../../../core/ai.text-utils";
import { extractProjectNameReply } from "../../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";

export async function handlePendingProjectCreate(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    q,
    ctx,
    pendingProjectKey,
    pendingStructuredKey,
    pendingProjectCreate,
    pendingStructured,
    isExplicitOperation,
  } = s;
  if (!pendingProjectCreate) return null;

    if (/^(取消|算了|不用了|先不创建)/.test(question)) {
      host.pendingProjectCreateMap.delete(pendingProjectKey);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      return {
        success: true,
        output: "已取消本次项目创建。需要时你直接说项目名称，我再继续。",
        metadata: buildMeta(startedAt),
      };
    }
  
    if (isExplicitOperation && !/(?:创建|新建|建立|添加)\s*项目/.test(q)) {
      host.pendingProjectCreateMap.delete(pendingProjectKey);
    } else {
      const projectName = pendingStructured?.first
        ? normalizeTaskTitle(pendingStructured.first)
        : extractProjectNameReply(question);
      if (!projectName || /^(?:创建|新建|建立|添加)\s*项目$/.test(projectName)) {
        return {
          success: true,
          output: "我还在等项目名称。直接回复名称即可，例如：AICR 重构。",
          metadata: buildMeta(startedAt),
        };
      }
  
      const created = await host.createProjectByName(ctx, projectName);
      host.pendingProjectCreateMap.delete(pendingProjectKey);
      host.pendingStructuredInputMap.delete(pendingStructuredKey);
      if (created.existed) {
        return {
          success: true,
          output: `已匹配到同名项目：${created.projectName}（ID: ${created.id}）。未重复创建。`,
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
  return null;
}
