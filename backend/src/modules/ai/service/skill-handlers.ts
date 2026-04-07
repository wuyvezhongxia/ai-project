import type { AuthContext } from "../../../common/types";
import { env } from "../../../config/env";
import { isNumericId, toTaskStatus } from "../core/ai.domain-format";
import { planProjectBatchStatusAdjust } from "../services/batch-adjust-project.service";
import { buildMeta, hasRealLlm } from "../core/ai.meta";
import { skillSchema } from "../core/ai.schemas";
import type { SkillParams } from "../core/ai.schemas";
import type { AiResponse } from "../core/ai.types";
import {
  buildTaskInsightPrompt,
  parseTaskInsightFromModelText,
  TASK_INSIGHT_FALLBACK_JSON,
  loadWeeklyReportFacts,
  renderWeeklyReportMarkdown,
} from "../chains";
import { callDeepSeekChatNonStreaming } from "./llm-messages";

export async function runGenerateWeeklyReport(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
  try {
    const startedAt = Date.now();
    const input = skillSchema.parse(params);

    if (!isNumericId(input.bizId)) {
      return { success: false, output: "", error: "bizId 必须是项目 ID" };
    }

    const facts = await loadWeeklyReportFacts(ctx, input.bizId);
    if (!facts) {
      return { success: false, output: "", error: "项目不存在或无权限" };
    }

    const output = renderWeeklyReportMarkdown(facts);

    return { success: true, output, metadata: buildMeta(startedAt) };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "周报生成失败",
    };
  }
}

/** POST /api/ai/delay-analysis：按项目预览批量状态调整（不落库；实际执行请在对话中确认） */
export async function runBatchAdjustPreview(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
  try {
    const startedAt = Date.now();
    const input = skillSchema.parse(params);

    if (!isNumericId(input.bizId)) {
      return { success: false, output: "", error: "bizId 必须是项目 ID" };
    }

    const plan = await planProjectBatchStatusAdjust(ctx, input.bizId, input.inputText);
    if (!plan.ok) {
      return { success: true, output: plan.output, metadata: buildMeta(startedAt) };
    }

    const output =
      `【接口预览】以下为拟批量修改的任务（本接口不会直接写入数据库）。\n\n` +
      `项目「${plan.projectName}」共 ${plan.taskIds.length} 条 →「${toTaskStatus(plan.toStatus)}」：\n` +
      `${plan.previewLines.join("\n")}\n\n` +
      `请在助手对话中发送相同说明并关联同一项目，在助手列出清单后回复「确认」以执行。`;

    return { success: true, output, metadata: buildMeta(startedAt) };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "批量调整预览失败",
    };
  }
}

export async function runGenerateTaskInsight(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
  try {
    const startedAt = Date.now();
    const input = skillSchema.parse(params);

    const prompt = buildTaskInsightPrompt(input.inputText);

    if (hasRealLlm()) {
      const llm = await callDeepSeekChatNonStreaming(prompt, ctx, input.bizId);
      const insight = parseTaskInsightFromModelText(llm.output);
      return {
        success: true,
        output: llm.output,
        insight,
        metadata: buildMeta(startedAt, {
          model: env.DEEPSEEK_MODEL,
          tokensUsed: llm.tokensUsed,
        }),
      };
    }

    const output = TASK_INSIGHT_FALLBACK_JSON;

    return {
      success: true,
      output,
      insight: parseTaskInsightFromModelText(output),
      metadata: buildMeta(startedAt),
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "任务洞察生成失败",
    };
  }
}

export async function runBreakdownTask(params: SkillParams, _ctx: AuthContext): Promise<AiResponse> {
  try {
    const startedAt = Date.now();
    const input = skillSchema.parse(params);
    const topic = input.inputText.trim();

    const output = `项目分析建议（草稿）：
1. 需求澄清与验收标准定义
2. 方案设计与任务分工
3. 开发实现与联调
4. 测试验证与问题修复
5. 上线准备与复盘总结

原始任务：${topic}
建议你把每一步再细化到“负责人 + 截止时间 + 交付物”。`;

    return { success: true, output, metadata: buildMeta(startedAt) };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "项目分析失败",
    };
  }
}
