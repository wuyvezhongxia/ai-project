import type { z } from "zod";
import { parseStructuredInsight, fallbackInsightFromText } from "../core/ai.insight";
import { taskInsightSchema } from "../core/ai.schemas";

export type TaskInsightPayload = z.infer<typeof taskInsightSchema>;

/**
 * 链式步骤 1：根据用户提供的任务上下文文本构造「只输出 JSON」的提示词。
 */
export function buildTaskInsightPrompt(inputText: string): string {
  return [
    "你是项目管理场景的分析助手。请根据用户给出的任务数据生成结构化洞察。",
    "必须只输出 JSON，不要输出任何额外解释。",
    "JSON Schema:",
    JSON.stringify({
      summary: "string",
      risks: ["string"],
      blockers: ["string"],
      nextActions: [{ action: "string", owner: "string(optional)", due: "YYYY-MM-DD(optional)", priority: "high|medium|low(optional)" }],
      todayChecklist: ["string"],
      confidence: "number(0~1, optional)",
    }),
    "要求：",
    "1) summary 1-2句",
    "2) risks/blockers 各 2-5 条",
    "3) nextActions 至少 3 条，动作要可执行",
    "4) todayChecklist 给 3-5 条当天可完成事项",
    "",
    "任务上下文如下：",
    inputText,
  ].join("\n");
}

/**
 * 链式步骤 2：将模型原始文本解析为结构化 insight（解析失败则回退启发式）。
 */
export function parseTaskInsightFromModelText(raw: string): TaskInsightPayload {
  return parseStructuredInsight(raw) ?? fallbackInsightFromText(raw);
}

export const TASK_INSIGHT_FALLBACK_JSON = `{
  "summary": "当前处于规则模式，已基于任务数据生成基础洞察。",
  "risks": ["任务信息维度有限，建议补充更细日志以提升准确度"],
  "blockers": ["缺少持续上下文与历史变更记录"],
  "nextActions": [
    { "action": "补充关键里程碑与负责人", "priority": "high" },
    { "action": "确认本周交付范围和依赖", "priority": "medium" },
    { "action": "按日更新任务进度", "priority": "medium" }
  ],
  "todayChecklist": ["确认负责人", "更新进度", "识别阻塞项"],
  "confidence": 0.45
}`;
