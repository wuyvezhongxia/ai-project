import { buildMeta } from "../../core/ai.meta";
import {
  inferActionFromStructuredFields,
  isLikelyStructuredFieldsText,
  parseLooseStructuredFields,
} from "../../core/ai.intent-parsing";
import type { AiChatHost, ChatTurnState } from "../chat-host";
import type { AiResponse } from "../../core/ai.types";

export async function runStructuredGuardPhase(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const {
    startedAt,
    question,
    q,
    input,
    pendingStructuredKey,
    pendingInferKey,
    isExplicitOperation,
  } = s;

  const hasExplicitDeleteVerb = /(?:删除|移除)/.test(q);
  
  // 安全护栏：用户只补充了目标名称/括号信息，但未明确说“删除/移除”时，不默认执行删除语义
  if (!hasExplicitDeleteVerb && !isExplicitOperation) {
    const looksLikeStructuredFields = isLikelyStructuredFieldsText(question);
    if (looksLikeStructuredFields) {
      const parsed = parseLooseStructuredFields(question);
      if (parsed) {
        host.pendingStructuredInputMap.set(pendingStructuredKey, {
          first: parsed.first,
          mention: parsed.mention,
          dueAt: parsed.dueAt,
          sourceText: question,
          requestedAt: Date.now(),
        });
        const inferred = inferActionFromStructuredFields(parsed, input.bizId);
        const HIGH_CONFIDENCE = 0.8;
  
        // 仅高置信度走“一句确认后直接执行”
        if (inferred.confidence >= HIGH_CONFIDENCE && inferred.action === "createTask") {
          host.pendingInferredActionMap.set(pendingInferKey, {
            action: "createTask",
            title: parsed.first,
            dueAt: parsed.dueAt,
            bizId: input.bizId,
            sourceText: question,
          });
          return {
            success: true,
            output:
              `我理解你想创建任务，标题「${parsed.first}」` +
              `${parsed.dueAt ? `，截止 ${parsed.dueAt.toISOString().slice(0, 10)}` : ""}。\n` +
              `如果我的理解没问题，回复「确认」我就直接创建；不对就回复「取消」并补充说明。`,
            metadata: buildMeta(startedAt),
          };
        }
  
        if (inferred.confidence >= HIGH_CONFIDENCE && inferred.action === "createProject") {
          host.pendingInferredActionMap.set(pendingInferKey, {
            action: "createProject",
            projectName: parsed.first,
            sourceText: question,
          });
          return {
            success: true,
            output:
              `我理解你可能想创建项目，项目名称先按「${parsed.first}」处理。\n` +
              `如果没问题回复「确认」我就直接创建；如果不是这个意图请回复「取消」并告诉我动作。`,
            metadata: buildMeta(startedAt),
          };
        }
  
        return {
          success: true,
          output:
            `我能理解你的信息，但当前置信度不够高，先不自动执行。\n` +
            `请补一句动作：创建项目 / 创建任务 / 创建子任务。`,
          metadata: buildMeta(startedAt),
        };
      }
      return {
        success: true,
        output:
          `我看到了结构化信息（如负责人/日期），但你还没给动作指令。\n` +
          `请先明确动作：创建项目 / 创建任务 / 创建子任务 / 查看 / 删除。`,
        metadata: buildMeta(startedAt),
      };
    }
    const likelyTargetOnly =
      /^[^\n]{1,80}$/.test(question) &&
      (/[（(].*[)）]/.test(question) || /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,40}$/.test(question));
    if (likelyTargetOnly) {
      return {
        success: true,
        output:
          `我理解你是在补充目标信息：${question}。\n` +
          `为避免误删，我不会默认执行删除。请明确动作后再继续，例如：\n` +
          `- 删除 ${question}\n` +
          `- 查看 ${question}\n` +
          `- 标记 ${question} 为已完成`,
        metadata: buildMeta(startedAt),
      };
    }
  }
  return null;
}
