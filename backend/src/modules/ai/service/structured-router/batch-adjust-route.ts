import { isNumericId } from "../../core/ai.domain-format";
import type { StructuredRouterResult } from "./schema";

/**
 * 结构化路由若误判为 general，会落入流式闲聊并可能 502；对「关联项目 + 批量改状态」类输入强制走 batch-adjust 技能。
 */
export function inferBatchAdjustStructuredResolution(
  inputText: string,
  bizId: string | undefined,
): Extract<StructuredRouterResult, { route: "skill" }> | null {
  if (!isNumericId(bizId?.trim())) return null;
  const t = inputText.trim();
  const looksBatch =
    /批量/.test(t) ||
    /(所有|全部)[^。\n]{0,80}?(待开始|未开始|进行中|已完成|完成|延期)[^。\n]{0,30}?(改为|改成|设为|标记|更新)/.test(t) ||
    /(改为|改成|设为|标记为|更新为|调成)[^。\n]{0,30}?(待开始|未开始|进行中|已完成|完成|延期)/.test(t);
  if (!looksBatch) return null;
  return { route: "skill", skill_id: "batch-adjust" };
}

export function applyBatchAdjustRouteOverride(
  inputText: string,
  bizId: string | undefined,
  r: StructuredRouterResult,
): StructuredRouterResult {
  if (r.route !== "general") return r;
  return inferBatchAdjustStructuredResolution(inputText, bizId) ?? r;
}
