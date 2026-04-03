import { z } from "zod";

import { toDbId } from "../../common/db-values";
import { prisma } from "../../common/prisma";
import { env } from "../../config/env";
import type { AuthContext } from "../../common/types";
import { getSkillRouterAgent } from "./skills/skill.router";

const chatSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().optional(),
});

const skillSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().min(1),
});

export type ChatParams = z.infer<typeof chatSchema>;
export type SkillParams = z.infer<typeof skillSchema>;

const taskInsightSchema = z.object({
  summary: z.string().min(1).default("暂无总结"),
  risks: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  nextActions: z
    .array(
      z.object({
        action: z.string().min(1),
        owner: z.string().optional(),
        due: z.string().optional(),
        priority: z.enum(["high", "medium", "low"]).optional(),
      }),
    )
    .default([]),
  todayChecklist: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export interface AiResponse {
  success: boolean;
  output: string;
  insight?: {
    summary: string;
    risks: string[];
    blockers: string[];
    nextActions: Array<{
      action: string;
      owner?: string;
      due?: string;
      priority?: "high" | "medium" | "low";
    }>;
    todayChecklist: string[];
    confidence?: number;
  };
  suggestions?: string[];
  metadata?: {
    model: string;
    tokensUsed: number;
    responseTime: number;
  };
  requiresConfirmation?: boolean;
  confirmationData?: {
    action: string;
    params: any;
    message: string;
  };
  error?: string;
}

type AiMetadata = NonNullable<AiResponse["metadata"]>;
type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

const isNumericId = (value?: string) => Boolean(value && /^\d+$/.test(value));

const toProjectStatus = (status?: string | null) => {
  if (status === "0") return "进行中";
  if (status === "1") return "已完成";
  if (status === "2") return "已归档";
  if (status === "3") return "已关闭";
  return "未知";
};

const toTaskStatus = (status?: string | null) => {
  if (status === "0") return "待开始";
  if (status === "1") return "进行中";
  if (status === "2") return "已完成";
  if (status === "3") return "延期";
  return "未知";
};

const buildMeta = (start: number, patch?: Partial<AiMetadata>): AiMetadata => ({
  model: patch?.model ?? (env.DEEPSEEK_MODEL || "rule-based"),
  tokensUsed: patch?.tokensUsed ?? 0,
  responseTime: patch?.responseTime ?? Date.now() - start,
});

const hasRealLlm = () => Boolean(env.DEEPSEEK_API_KEY);

const toTaskStatusCode = (statusText: string): "0" | "1" | "2" | "3" => {
  if (/已完成|完成/.test(statusText)) return "2";
  if (/进行中/.test(statusText)) return "1";
  if (/延期/.test(statusText)) return "3";
  return "0";
};

const normalizeTaskTitle = (raw: string) =>
  raw
    .trim()
    .replace(/[“”"'`《》]/g, "")
    .replace(/[。！!？?]+$/g, "")
    .trim();

const canManageTask = async (ctx: AuthContext, taskId: string) => {
  if (ctx.roleIds.includes("1")) return true;
  const id = toDbId(taskId);
  const currentUserId = toDbId(ctx.userId);
  const task = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id },
    select: { assigneeUserId: true, creatorUserId: true, createBy: true },
  });
  if (!task) return false;
  if (task.assigneeUserId === currentUserId || task.creatorUserId === currentUserId || task.createBy === currentUserId) {
    return true;
  }
  const collaborator = await prisma.taskCollaborator.findFirst({
    where: {
      tenantId: ctx.tenantId,
      taskId: id,
      userId: currentUserId,
      delFlag: "0",
    },
  });
  return Boolean(collaborator);
};

const extractJsonObjectText = (raw: string): string | null => {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1).trim();
  }
  return null;
};

const parseStructuredInsight = (raw: string): z.infer<typeof taskInsightSchema> | null => {
  const jsonText = extractJsonObjectText(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return taskInsightSchema.parse(parsed);
  } catch {
    return null;
  }
};

const fallbackInsightFromText = (text: string): z.infer<typeof taskInsightSchema> => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = lines[0] ?? "已生成洞察，请查看详情。";
  const listCandidates = lines.filter((line) => /^[-*]\s+|^\d+\.\s+/.test(line));
  const normalized = listCandidates.map((line) => line.replace(/^[-*]\s+|^\d+\.\s+/, "").trim());
  return {
    summary,
    risks: normalized.slice(0, 3),
    blockers: normalized.slice(3, 5),
    nextActions: normalized.slice(0, 3).map((item) => ({ action: item, priority: "medium" as const })),
    todayChecklist: normalized.slice(0, 4),
    confidence: 0.55,
  };
};

const cleanQuotedText = (value: string) =>
  value
    .trim()
    .replace(/^[“”"'`《》\s]+/, "")
    .replace(/[“”"'`《》\s]+$/, "")
    .replace(/[。！!？?]+$/g, "")
    .trim();

const normalizeLooseText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s\-_/\\.,，。:：;；"'`“”‘’【】\[\]()（）<>《》]/g, "")
    .trim();

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
};

type DeleteTaskTarget = {
  raw: string;
  coreName: string;
  projectHint?: string;
  statusHint?: string;
};

const extractDeleteTaskTarget = (text: string): DeleteTaskTarget | null => {
  const matched = text.match(/(?:请|帮我|麻烦|可以)?\s*(?:删除|移除)\s*(.+)/);
  if (!matched?.[1]) return null;

  let target = matched[1].trim();
  target = target.replace(/^(?:一下|这个|那个)\s*/, "").trim();
  target = target.replace(/(?:吧|一下|好吗|可以吗|行吗)\s*$/g, "").trim();
  const raw = cleanQuotedText(target);
  if (!raw) return null;

  const parenthesized = raw.match(/^(.*?)[(（]\s*([^()（）]+)\s*[)）]\s*$/);
  let coreName = cleanQuotedText(parenthesized?.[1] ?? raw);
  const hintText = parenthesized?.[2] ?? "";
  const hintTokens = hintText
    .split(/[,，、/]/)
    .map((item) => cleanQuotedText(item))
    .filter(Boolean);
  const statusToken = hintTokens.find((token) => /待开始|进行中|已完成|完成|延期/.test(token));
  const projectToken = hintTokens.find((token) => token !== statusToken);

  coreName = cleanQuotedText(coreName.replace(/^任务/, "").replace(/任务$/, ""));
  if (!coreName) coreName = raw;

  return {
    raw,
    coreName,
    projectHint: projectToken,
    statusHint: statusToken,
  };
};

export class AiService {
  private async buildChatContext(ctx: AuthContext, bizId?: string) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const [
      projectCount,
      ownedTaskCount,
      riskTaskCount,
      recentTasks,
      todayDueTasks,
      highPriorityTasks,
      delayedTasks,
      userProjects
    ] = await Promise.all([
      // 1. 项目统计
      prisma.project.count({ where: { tenantId: ctx.tenantId, delFlag: "0" } }),

      // 2. 用户负责的任务数
      prisma.task.count({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          assigneeUserId: toDbId(ctx.userId),
        },
      }),

      // 3. 高风险任务数
      prisma.task.count({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          riskLevel: { in: ["2", "3"] },
          status: { not: "2" },
        },
      }),

      // 4. 最近更新的任务
      prisma.task.findMany({
        where: { tenantId: ctx.tenantId, delFlag: "0" },
        orderBy: { id: "desc" },
        select: { taskName: true, status: true, dueTime: true },
        take: 5,
      }),

      // 5. 今天到期的任务（用户负责）
      prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          assigneeUserId: toDbId(ctx.userId),
          dueTime: { gte: todayStart, lt: todayEnd },
          status: { not: "2" }, // 未完成的
        },
        select: { id: true, taskName: true, status: true, priority: true },
        take: 10,
      }),

      // 6. 高优先级任务（用户负责）
      prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          assigneeUserId: toDbId(ctx.userId),
          priority: "0", // 紧急
          status: { not: "2" }, // 未完成的
        },
        select: { id: true, taskName: true, status: true, dueTime: true },
        take: 5,
      }),

      // 7. 延期任务（用户负责）
      prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          assigneeUserId: toDbId(ctx.userId),
          status: "3", // 延期
        },
        select: { id: true, taskName: true, dueTime: true, riskLevel: true },
        take: 5,
      }),

      // 8. 用户参与的项目
      prisma.project.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          OR: [
            { ownerUserId: toDbId(ctx.userId) },
            { createBy: toDbId(ctx.userId) },
          ],
        },
        select: { id: true, projectName: true, status: true, progress: true },
        take: 5,
      }),
    ]);

    let projectDetail: string | null = null;
    if (bizId && isNumericId(bizId)) {
      const project = await prisma.project.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(bizId), delFlag: "0" },
        select: { projectName: true, status: true, progress: true, endTime: true, ownerUserId: true },
      });
      if (project) {
        projectDetail = `当前关注项目：${project.projectName}，状态 ${toProjectStatus(project.status)}，进度 ${Number(
          project.progress ?? 0,
        ).toFixed(0)}%，截止 ${project.endTime?.toISOString().slice(0, 10) ?? "未设置"}，负责人：用户${project.ownerUserId}`;
      }
    }

    return {
      // 统计数据
      projectCount,
      ownedTaskCount,
      riskTaskCount,

      // 任务详情
      todayDueTasks: todayDueTasks.map(t => ({
        id: String(t.id),
        taskName: t.taskName,
        status: toTaskStatus(t.status),
        priority: t.priority === "0" ? "紧急" : t.priority === "1" ? "高" : "普通",
      })),
      highPriorityTasks: highPriorityTasks.map(t => ({
        id: String(t.id),
        taskName: t.taskName,
        status: toTaskStatus(t.status),
        dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
      })),
      delayedTasks: delayedTasks.map(t => ({
        id: String(t.id),
        taskName: t.taskName,
        dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
        riskLevel: t.riskLevel === "3" ? "高风险" : t.riskLevel === "2" ? "中风险" : "低风险",
      })),

      // 项目信息
      userProjects: userProjects.map(p => ({
        id: String(p.id),
        projectName: p.projectName,
        status: toProjectStatus(p.status),
        progress: Number(p.progress ?? 0).toFixed(0) + "%",
      })),

      // 其他
      recentTasks: recentTasks.map((t) => ({
        taskName: t.taskName,
        status: toTaskStatus(t.status),
        dueDate: t.dueTime?.toISOString().slice(0, 10) ?? null,
      })),
      projectDetail,

      // 时间信息（用于上下文）
      currentDate: today.toISOString().slice(0, 10),
    };
  }

  private async buildConversationMessages(ctx: AuthContext, bizId?: string): Promise<LlmMessage[]> {
    const rows = await prisma.aiRecord.findMany({
      where: {
        tenantId: ctx.tenantId,
        createBy: toDbId(ctx.userId),
        bizType: "chat",
        ...(bizId && isNumericId(bizId) ? { bizId: toDbId(bizId) } : {}),
      },
      orderBy: { createTime: "desc" },
      take: 8,
      select: { inputText: true, outputText: true },
    });

    const history = rows.reverse();
    const messages: LlmMessage[] = [];
    for (const row of history) {
      if (row.inputText?.trim()) {
        messages.push({ role: "user", content: row.inputText.trim() });
      }
      if (row.outputText?.trim()) {
        messages.push({ role: "assistant", content: row.outputText.trim() });
      }
    }
    return messages;
  }

  private async buildModelMessages(inputText: string, ctx: AuthContext, bizId?: string): Promise<LlmMessage[]> {
    const [context, history] = await Promise.all([
      this.buildChatContext(ctx, bizId),
      this.buildConversationMessages(ctx, bizId),
    ]);

    const systemPrompt = `
# 角色设定
你是项目管理系统的智能工作助手，名字叫"小P"。你的目标是帮助用户高效管理项目、任务和团队协作。

# 核心能力
1. **主动思考**：不只是回答问题，要分析用户的深层需求，识别潜在风险，提出建设性建议。
2. **对话式交互**：像真人同事一样聊天，语气亲切自然，避免机械式回答。
3. **深度追问**：当信息不足时，主动提出最小化、具体的问题来获取必要信息。
4. **可执行建议**：提供的建议要具体、可操作，最好能给出明确的下一步行动。

# 对话风格指南
- 使用自然的口语化表达，如"我觉得..."、"我们可以..."、"要不要试试..."
- 一次回答不要超过5-6行，保持简洁
- 复杂问题可以分步骤回答，先给结论再解释
- 适当使用表情符号增加亲和力（如😊👍📊）
- 结尾可以抛出一个开放式问题引导对话继续

# 工作原则
1. **基于事实**：只能基于提供的业务上下文回答，不编造不存在的数据。
2. **聚焦工作**：围绕项目管理、任务协作、进度跟踪、风险识别等核心工作场景。
3. **安全第一**：涉及数据修改、删除等操作时，必须提醒用户确认。

# 示例回答模式
用户："今天有什么要关注的吗？"
你："根据你的项目数据，有3个任务今天到期，其中1个有高风险😟。建议你先处理任务#123，需要我帮你查看详情吗？"

用户："帮我创建一个新任务"
你："好的！请告诉我任务标题，还有需要分配给谁吗？截止时间是什么时候？"

用户："项目进度怎么样？"
你："项目A当前进度65%，比计划慢了一些。主要卡在测试环节，需要加派人手。要我生成详细进度报告吗？"
`.trim();

    return [
      { role: "system", content: systemPrompt },
      { role: "system", content: `业务上下文(JSON)：${JSON.stringify(context)}` },
      ...history,
      { role: "user", content: inputText },
    ];
  }

  private async callDeepSeekChat(inputText: string, ctx: AuthContext, bizId?: string): Promise<{ output: string; tokensUsed: number }> {
    if (!hasRealLlm() || !env.DEEPSEEK_API_KEY) {
      throw new Error("未配置 DEEPSEEK_API_KEY，无法调用真实模型");
    }

    const messages = await this.buildModelMessages(inputText, ctx, bizId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT);

    try {
      const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: env.AI_MAX_TOKENS_PER_REQUEST,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`DeepSeek请求失败(${response.status}) ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const output = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!output) {
        throw new Error("模型未返回有效内容");
      }
      return {
        output,
        tokensUsed: data.usage?.total_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async streamChat(
    params: ChatParams,
    ctx: AuthContext,
    onToken: (token: string) => Promise<void> | void,
  ): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = chatSchema.parse(params);
      const streamQuestion = input.inputText.trim();
      const streamLowerText = streamQuestion.toLowerCase();

      // 对「事务型命令」优先走确定性规则链路（chat 内含消歧、确认等逻辑）
      const isOperationIntent =
        /(?:创建|新建|建立|添加).{0,8}任务/.test(streamLowerText) ||
        /(?:删除|移除).{0,6}任务\s*(\d+)/.test(streamLowerText) ||
        /^(?:请|帮我|麻烦|可以)?\s*(?:删除|移除)\s*\S+/.test(streamLowerText) ||
        (/(?:删除|移除)/.test(streamLowerText) && /任务/.test(streamLowerText)) ||
        /(?:恢复|还原).{0,6}任务\s*(\d+)/.test(streamLowerText) ||
        /(?:把|将)?任务\s*(\d+).{0,8}(?:改为|设为|标记为)\s*(待开始|进行中|已完成|完成|延期)/.test(streamLowerText) ||
        /(?:查看|查询|详情).{0,4}任务\s*(\d+)/.test(streamLowerText);
      if (isOperationIntent) {
        return this.chat(params, ctx);
      }

      if (!hasRealLlm() || !env.DEEPSEEK_API_KEY) {
        // 未配置真实模型时，回退到普通 chat（保持可用性）
        return this.chat(params, ctx);
      }

      // 流式对话优先走底层模型的 stream=true，确保前端可按 token 渐进显示。
      // （Skill 路由器通常返回整段文本，会导致“先空白等待再整段出现”的体验问题）

      const messages = await this.buildModelMessages(input.inputText, ctx, input.bizId);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: env.DEEPSEEK_MODEL,
            stream: true,
            messages,
            temperature: 0.3,
            max_tokens: env.AI_MAX_TOKENS_PER_REQUEST,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errorText = await response.text().catch(() => "");
          throw new Error(`DeepSeek流式请求失败(${response.status}) ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let output = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event
              .split("\n")
              .find((item) => item.startsWith("data:"));
            if (!line) continue;

            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            let parsed: { choices?: Array<{ delta?: { content?: string } }> } | null = null;
            try {
              parsed = JSON.parse(payload);
            } catch {
              parsed = null;
            }
            if (!parsed) continue;

            const token = parsed.choices?.[0]?.delta?.content ?? "";
            if (!token) continue;
            output += token;
            await onToken(token);
          }
        }

        return {
          success: true,
          output,
          metadata: buildMeta(startedAt, { model: env.DEEPSEEK_MODEL }),
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "AI流式处理失败",
      };
    }
  }

  /**
   * 将AgentResult转换为AiResponse
   */
  private agentResultToAiResponse(agentResult: any, startedAt: number): AiResponse {
    return {
      success: agentResult.success,
      output: agentResult.output || '',
      suggestions: agentResult.suggestions,
      requiresConfirmation: agentResult.requiresConfirmation,
      confirmationData: agentResult.confirmationData,
      metadata: buildMeta(startedAt, {
        model: agentResult.model || env.DEEPSEEK_MODEL,
        tokensUsed: agentResult.tokensUsed || 0,
      }),
      error: agentResult.error,
    };
  }

  async chat(params: ChatParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = chatSchema.parse(params);
      const question = input.inputText.trim();
      const q = question.toLowerCase();
      const hasExplicitDeleteVerb = /(?:删除|移除)/.test(question);

      // 安全护栏：用户只补充了目标名称/括号信息，但未明确说“删除/移除”时，不默认执行删除语义
      if (!hasExplicitDeleteVerb) {
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

      // 辅助函数：检查是否是预定义的操作命令
      const isPredefinedAction = (text: string): boolean => {
        const lowerText = text.toLowerCase();
        // 创建任务
        if (/(?:创建|新建|建立|添加).{0,8}任务(?:，|,|：|:)?(?:叫|名为|名称是)?\s*([^\n]+)/.test(lowerText)) {
          return true;
        }
        // 删除任务
        if (/(?:删除|移除).{0,6}任务\s*(\d+)/.test(lowerText)) {
          return true;
        }
        if (/^(?:请|帮我|麻烦|可以)?\s*(?:删除|移除)\s*\S+/.test(lowerText)) {
          return true;
        }
        if (/(?:删除|移除)/.test(lowerText) && /任务/.test(lowerText)) {
          return true;
        }
        // 恢复任务
        if (/(?:恢复|还原).{0,6}任务\s*(\d+)/.test(lowerText)) {
          return true;
        }
        // 修改任务状态
        if (/(?:把|将)?任务\s*(\d+).{0,8}(?:改为|设为|标记为)\s*(待开始|进行中|已完成|完成|延期)/.test(lowerText)) {
          return true;
        }
        // 查询任务详情
        if (/(?:查看|查询|详情).{0,4}任务\s*(\d+)/.test(lowerText)) {
          return true;
        }
        return false;
      };

      // 如果是预定义操作，执行原有逻辑
      if (isPredefinedAction(question)) {
        // 2) 新建任务：如「帮我建一个任务，叫xxxx」
        const createMatch = question.match(/(?:创建|新建|建立|添加).{0,8}任务(?:，|,|：|:)?(?:叫|名为|名称是)?\s*([^\n]+)/);
        if (createMatch) {
          const title = normalizeTaskTitle(createMatch[1] ?? "");
          if (!title) {
            return { success: false, output: "", error: "任务标题为空，无法创建任务" };
          }

          let projectId: bigint | null = null;
          if (input.bizId && /^\d+$/.test(input.bizId)) {
            const project = await prisma.project.findFirst({
              where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
              select: { id: true },
            });
            projectId = project?.id ?? null;
          }

          let created = await prisma.task.create({
            data: {
              tenantId: ctx.tenantId,
              projectId,
              taskName: title,
              taskDesc: null,
              assigneeUserId: toDbId(ctx.userId),
              assigneeDeptId: ctx.deptId ? toDbId(ctx.deptId) : null,
              creatorUserId: toDbId(ctx.userId),
              status: "0",
              priority: "1",
              progress: "0",
              startTime: null,
              dueTime: null,
              finishTime: null,
              riskLevel: "0",
              parentTaskId: null,
              createDept: ctx.deptId ? toDbId(ctx.deptId) : null,
              createBy: toDbId(ctx.userId),
              createTime: new Date(),
              delFlag: "0",
            },
            select: { id: true, taskName: true, projectId: true, status: true, priority: true },
          });
          if (!created) {
            return { success: false, output: "", error: "任务创建失败" };
          }

          await prisma.task.update({
            where: { id: created.id },
            data: { taskNo: `TASK-${String(created.id)}` },
          });

          const output = `任务已创建成功：\n- ID: ${created.id}\n- 标题: ${created.taskName}\n- 状态: ${toTaskStatus(created.status)}\n- 所属项目: ${
            created.projectId ? String(created.projectId) : "未归属项目"
          }`;
          return { success: true, output, metadata: buildMeta(startedAt) };
        }

        // 3) 删除任务
        const deleteMatch = question.match(/(?:删除|移除).{0,6}任务\s*(\d+)/);
        if (deleteMatch) {
          const taskId = deleteMatch[1]!;
          const hasPermission = await canManageTask(ctx, taskId);
          if (!hasPermission) {
            return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
          }
          const existing = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
            select: { id: true, taskName: true, projectId: true },
          });
          if (!existing) {
            const latestRows = await prisma.task.findMany({
              where: { tenantId: ctx.tenantId, delFlag: "0" },
              select: { id: true, taskName: true, status: true, projectId: true },
              orderBy: { id: "desc" },
              take: 8,
            });
            const visibleRows: Array<{ id: string; taskName: string; status: string | null; projectId: string | null }> = [];
            for (const row of latestRows) {
              if (await canManageTask(ctx, String(row.id))) {
                visibleRows.push({
                  id: String(row.id),
                  taskName: row.taskName ?? "",
                  status: row.status,
                  projectId: row.projectId ? String(row.projectId) : null,
                });
              }
            }

            const projectIds = Array.from(new Set(visibleRows.map((row) => row.projectId).filter((id): id is string => Boolean(id))));
            const projectRows =
              projectIds.length > 0
                ? await prisma.project.findMany({
                    where: { tenantId: ctx.tenantId, id: { in: projectIds.map((id) => toDbId(id)) }, delFlag: "0" },
                    select: { id: true, projectName: true },
                  })
                : [];
            const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));
            const latestText = visibleRows
              .slice(0, 6)
              .map((row) => `- ${row.taskName}（${row.projectId ? projectNameMap.get(row.projectId) || "未归属项目" : "未归属项目"}，${toTaskStatus(row.status)}）`)
              .join("\n");

            return {
              success: true,
              output:
                `你说得对，刚才候选列表已经过期了：任务 ${taskId} 现在不存在（可能已被删除）。\n` +
                `我已刷新当前可删除任务（任务模块）：\n${latestText}\n` +
                `请直接回复「删除<完整任务名>」，例如：删除${visibleRows[0]?.taskName || "某任务"}`,
              metadata: buildMeta(startedAt),
            };
          }
          const project = existing.projectId
            ? await prisma.project.findFirst({
                where: { tenantId: ctx.tenantId, id: existing.projectId, delFlag: "0" },
                select: { projectName: true },
              })
            : null;
          // 返回确认请求，而不是直接删除
          return {
            success: true,
            output: `检测到删除任务请求：任务「${existing.taskName}」${project?.projectName ? `（项目：${project.projectName}）` : ""}。请确认是否删除。`,
            requiresConfirmation: true,
            confirmationData: {
              action: "deleteTask",
              params: { taskId, taskName: existing.taskName, projectName: project?.projectName ?? undefined, module: "task" },
              message: `确定要删除任务「${existing.taskName}」吗？此操作无法撤销。`,
            },
            metadata: buildMeta(startedAt),
          };
        }

        const deleteTarget = extractDeleteTaskTarget(question);
        if (deleteTarget) {
          const deleteTargetRaw = deleteTarget.raw;
          const numericInTarget = deleteTarget.coreName.match(/^(?:任务\s*)?(\d+)$/);
          if (!numericInTarget) {
            const variants = Array.from(
              new Set(
                [
                  deleteTarget.coreName,
                  deleteTargetRaw,
                  cleanQuotedText(deleteTarget.coreName.replace(/^任务/, "")),
                  cleanQuotedText(deleteTarget.coreName.replace(/任务$/, "")),
                ].filter((item) => item && item.length >= 2),
              ),
            );

            if (variants.length > 0) {
              const rows = await prisma.task.findMany({
                where: {
                  tenantId: ctx.tenantId,
                  delFlag: "0",
                  OR: variants.map((name) => ({
                    taskName: { contains: name, mode: "insensitive" },
                  })),
                },
                select: {
                  id: true,
                  taskName: true,
                  status: true,
                  projectId: true,
                },
                orderBy: { id: "desc" },
                take: 8,
              });
              const projectIdSet = Array.from(
                new Set(rows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)),
              );
              const projectRows =
                projectIdSet.length > 0
                  ? await prisma.project.findMany({
                      where: {
                        tenantId: ctx.tenantId,
                        id: { in: projectIdSet.map((id) => toDbId(id)) },
                        delFlag: "0",
                      },
                      select: { id: true, projectName: true },
                    })
                  : [];
              const projectNameMap = new Map(projectRows.map((row) => [String(row.id), row.projectName ?? ""]));

              const candidates: Array<{ id: string; taskName: string; status: string | null; projectName?: string }> = [];
              for (const row of rows) {
                const taskId = String(row.id);
                if (await canManageTask(ctx, taskId)) {
                  candidates.push({
                    id: taskId,
                    taskName: row.taskName ?? "",
                    status: row.status,
                    projectName: row.projectId ? projectNameMap.get(String(row.projectId)) : undefined,
                  });
                }
              }

              if (candidates.length === 0) {
                const fallbackRows = await prisma.task.findMany({
                  where: { tenantId: ctx.tenantId, delFlag: "0" },
                  select: { id: true, taskName: true, status: true, projectId: true },
                  orderBy: { id: "desc" },
                  take: 30,
                });
                const fallbackProjectIds = Array.from(
                  new Set(fallbackRows.map((row) => (row.projectId ? String(row.projectId) : "")).filter(Boolean)),
                );
                const fallbackProjectRows =
                  fallbackProjectIds.length > 0
                    ? await prisma.project.findMany({
                        where: {
                          tenantId: ctx.tenantId,
                          id: { in: fallbackProjectIds.map((id) => toDbId(id)) },
                          delFlag: "0",
                        },
                        select: { id: true, projectName: true },
                      })
                    : [];
                const fallbackProjectMap = new Map(
                  fallbackProjectRows.map((row) => [String(row.id), row.projectName ?? ""]),
                );

                const normalizedTarget = normalizeLooseText(deleteTarget.coreName || deleteTargetRaw);
                const fuzzyCandidates: Array<{
                  id: string;
                  taskName: string;
                  status: string | null;
                  projectName?: string;
                  score: number;
                }> = [];

                for (const row of fallbackRows) {
                  const taskId = String(row.id);
                  if (!(await canManageTask(ctx, taskId))) continue;
                  const taskName = row.taskName ?? "";
                  const normalizedTaskName = normalizeLooseText(taskName);
                  if (!normalizedTaskName || !normalizedTarget) continue;

                  let score = 0;
                  if (normalizedTaskName === normalizedTarget) score += 10;
                  if (normalizedTaskName.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedTaskName)) score += 6;
                  if (normalizedTaskName.includes(normalizedTarget) || normalizedTarget.includes(normalizedTaskName)) score += 4;
                  const distance = levenshteinDistance(normalizedTaskName, normalizedTarget);
                  if (distance <= 2) score += 4 - distance;

                  if (deleteTarget.projectHint) {
                    const projectName = row.projectId ? fallbackProjectMap.get(String(row.projectId)) || "" : "";
                    if (projectName.toLowerCase().includes(deleteTarget.projectHint.toLowerCase())) score += 2;
                  }

                  if (score > 0) {
                    fuzzyCandidates.push({
                      id: taskId,
                      taskName,
                      status: row.status,
                      projectName: row.projectId ? fallbackProjectMap.get(String(row.projectId)) : undefined,
                      score,
                    });
                  }
                }

                const topFuzzy = fuzzyCandidates.sort((a, b) => b.score - a.score).slice(0, 5);
                if (topFuzzy.length > 0) {
                  const optionText = topFuzzy
                    .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}）`)
                    .join("\n");
                  return {
                    success: true,
                    output:
                      `我没有精确匹配到「${deleteTargetRaw}」，但找到了可能相关的任务：\n` +
                      `${optionText}\n` +
                      `请回复完整目标，例如：删除 ${topFuzzy[0]!.taskName}（${topFuzzy[0]!.projectName || "未归属项目"}，${toTaskStatus(topFuzzy[0]!.status)}）`,
                    metadata: buildMeta(startedAt),
                  };
                }

                return {
                  success: true,
                  output:
                    `我没有找到可删除的任务「${deleteTargetRaw}」。\n` +
                    `请补充更完整的信息（任务名/所属项目/状态），例如：删除 test1（演示项目，进行中）。`,
                  metadata: buildMeta(startedAt),
                };
              }

              const resolved = candidates
                .map((item) => {
                  const taskStatus = toTaskStatus(item.status);
                  let score = 0;
                  if (item.taskName.toLowerCase() === deleteTarget.coreName.toLowerCase()) score += 8;
                  if (item.taskName.toLowerCase().includes(deleteTarget.coreName.toLowerCase())) score += 4;
                  if (variants.some((name) => item.taskName.toLowerCase() === name.toLowerCase())) score += 2;
                  if (deleteTarget.projectHint && item.projectName?.toLowerCase().includes(deleteTarget.projectHint.toLowerCase())) score += 3;
                  if (deleteTarget.statusHint && taskStatus.includes(deleteTarget.statusHint.replace("完成", "已完成"))) score += 2;
                  return { ...item, score };
                })
                .sort((a, b) => b.score - a.score);

              const topScore = resolved[0]?.score ?? 0;
              const topResolved = resolved.filter((item) => item.score === topScore);

              const normalizedCoreName = cleanQuotedText(deleteTarget.coreName).toLowerCase();
              const exactResolved = resolved.filter(
                (item) => cleanQuotedText(item.taskName).toLowerCase() === normalizedCoreName,
              );

              // 仅在“明确精确命中单个任务”时，才进入最终删除确认弹窗。
              // 对于“删除ai”->“ai2”这类模糊匹配，先让用户确认目标，避免误删。
              if (exactResolved.length === 1) {
                const target = exactResolved[0]!;
                return {
                  success: true,
                  output: `检测到删除任务请求：任务「${target.taskName}」${target.projectName ? `（项目：${target.projectName}）` : ""}。请确认是否删除。`,
                  requiresConfirmation: true,
                  confirmationData: {
                    action: "deleteTask",
                    params: { taskId: target.id, taskName: target.taskName, projectName: target.projectName, module: "task" },
                    message: `确定要删除任务「${target.taskName}」吗？此操作无法撤销。`,
                  },
                  metadata: buildMeta(startedAt),
                };
              }

              if (topResolved.length === 1 && topScore > 0) {
                const target = topResolved[0]!;
                return {
                  success: true,
                  output:
                    `我猜你要删除的是任务「${target.taskName}」${target.projectName ? `（项目：${target.projectName}）` : ""}。\n` +
                    `请先确认目标：\n` +
                    `- 若是该任务，请回复：删除 ${target.taskName}\n` +
                    `- 若不是，请回复更完整名称（可带项目/状态），例如：删除 ${target.taskName}（${target.projectName || "未归属项目"}，${toTaskStatus(target.status)}）`,
                  metadata: buildMeta(startedAt),
                };
              }

              const optionText = resolved
                .slice(0, 5)
                .map((item) => `- ${item.taskName}（${item.projectName || "未归属项目"}，${toTaskStatus(item.status)}）`)
                .join("\n");

              return {
                success: true,
                output:
                  `我找到了多个可能匹配「${deleteTargetRaw}」的任务，请先确认具体目标：\n` +
                  `${optionText}\n` +
                  `请回复更完整名称，例如「删除 ${resolved[0]!.taskName}（${resolved[0]!.projectName || "未归属项目"}，${toTaskStatus(resolved[0]!.status)}）」。`,
                metadata: buildMeta(startedAt),
              };
            }
          }
        }

        // 4) 恢复任务
        const restoreMatch = question.match(/(?:恢复|还原).{0,6}任务\s*(\d+)/);
        if (restoreMatch) {
          const taskId = restoreMatch[1]!;
          const hasPermission = await canManageTask(ctx, taskId);
          if (!hasPermission) {
            return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
          }
          const existing = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: toDbId(taskId) },
            select: { id: true, taskName: true, delFlag: true },
          });
          if (!existing) {
            return { success: false, output: "", error: `任务 ${taskId} 不存在` };
          }
          if (existing.delFlag === "0") {
            return { success: true, output: `任务 ${taskId} 当前是正常状态，无需恢复。`, metadata: buildMeta(startedAt) };
          }
          await prisma.task.update({
            where: { id: existing.id },
            data: { delFlag: "0", updateBy: toDbId(ctx.userId), updateTime: new Date() },
          });
          return { success: true, output: `任务 ${taskId}（${existing.taskName}）已恢复。`, metadata: buildMeta(startedAt) };
        }

        // 5) 修改任务状态
        const statusMatch = question.match(/(?:把|将)?任务\s*(\d+).{0,8}(?:改为|设为|标记为)\s*(待开始|进行中|已完成|完成|延期)/);
        if (statusMatch) {
          const taskId = statusMatch[1]!;
          const status = toTaskStatusCode(statusMatch[2]!);
          const hasPermission = await canManageTask(ctx, taskId);
          if (!hasPermission) {
            return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
          }
          const existing = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
            select: { id: true, taskName: true },
          });
          if (!existing) {
            return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
          }
          await prisma.task.update({
            where: { id: existing.id },
            data: {
              status,
              progress: status === "2" ? "100" : undefined,
              finishTime: status === "2" ? new Date() : null,
              updateBy: toDbId(ctx.userId),
              updateTime: new Date(),
            },
          });
          return {
            success: true,
            output: `任务 ${taskId}（${existing.taskName}）状态已更新为「${toTaskStatus(status)}」。`,
            metadata: buildMeta(startedAt),
          };
        }

        // 6) 查询任务详情
        const detailMatch = question.match(/(?:查看|查询|详情).{0,4}任务\s*(\d+)/);
        if (detailMatch) {
          const taskId = detailMatch[1]!;
          const hasPermission = await canManageTask(ctx, taskId);
          if (!hasPermission) {
            return { success: false, output: "", error: `你没有任务 ${taskId} 的访问权限` };
          }
          const task = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
            select: { id: true, taskName: true, status: true, priority: true, progress: true, dueTime: true, projectId: true },
          });
          if (!task) {
            return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
          }
          return {
            success: true,
            output: `任务详情：
- ID: ${task.id}
- 标题: ${task.taskName}
- 状态: ${toTaskStatus(task.status)}
- 优先级: ${task.priority ?? "未设置"}
- 进度: ${Number(task.progress ?? 0).toFixed(0)}%
- 截止时间: ${task.dueTime?.toISOString().slice(0, 10) ?? "未设置"}
- 所属项目: ${task.projectId ? String(task.projectId) : "未归属项目"}`,
            metadata: buildMeta(startedAt),
          };
        }
      }
      // 非预定义操作使用Skill路由器
      try {
        // 获取Skill路由器实例
        const skillRouter = getSkillRouterAgent();

        // 构建Agent上下文
        const agentContext = {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          sessionId: `session_${Date.now()}_${ctx.userId}`,
          history: await this.buildConversationMessages(ctx, input.bizId),
          bizId: input.bizId,
        };

        // 使用路由器处理请求
        const agentResult = await skillRouter.routeAndExecute(question, agentContext);

        // 转换结果为AiResponse
        return this.agentResultToAiResponse(agentResult, startedAt);
      } catch (routerError) {
        console.error('Skill路由器处理失败:', routerError);
        // 路由器失败时回退到原始逻辑
        if (hasRealLlm()) {
          const llm = await this.callDeepSeekChat(question, ctx, input.bizId);
          return {
            success: true,
            output: llm.output,
            suggestions: [
              "帮我总结今天最该先做的3件事",
              "分析我负责任务里的延期风险",
              "给我一版本周工作总结草稿",
            ],
            metadata: buildMeta(startedAt, {
              model: env.DEEPSEEK_MODEL,
              tokensUsed: llm.tokensUsed,
            }),
          };
        }

        return {
          success: true,
          output:
            `已收到你的问题：「${question}」。\n` +
            `当前处于规则引擎模式，Skill路由器处理失败: ${routerError instanceof Error ? routerError.message : '未知错误'}`,
          metadata: buildMeta(startedAt),
        };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "AI处理失败",
      };
    }
  }

  async generateWeeklyReport(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);

      if (!isNumericId(input.bizId)) {
        return { success: false, output: "", error: "bizId 必须是项目 ID" };
      }

      const [project, tasks] = await Promise.all([
        prisma.project.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
          select: { projectName: true, status: true, progress: true },
        }),
        prisma.task.findMany({
          where: { tenantId: ctx.tenantId, projectId: toDbId(input.bizId), delFlag: "0" },
          select: { taskName: true, status: true, riskLevel: true },
        }),
      ]);

      if (!project) {
        return { success: false, output: "", error: "项目不存在或无权限" };
      }

      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "2").length;
      const inProgress = tasks.filter((t) => t.status === "1").length;
      const delayed = tasks.filter((t) => t.status === "3").length;
      const risk = tasks.filter((t) => ["2", "3"].includes(t.riskLevel ?? "0")).length;

      const output = `# ${project.projectName} 周报草稿

- 项目状态：${toProjectStatus(project.status)}
- 当前进度：${Number(project.progress ?? 0).toFixed(0)}%
- 任务总数：${total}
- 已完成：${completed}
- 进行中：${inProgress}
- 延期：${delayed}
- 风险任务：${risk}

## 本周进展
- 团队围绕核心目标持续推进，完成项占比 ${total > 0 ? Math.round((completed / total) * 100) : 0}%。

## 风险与问题
- 当前延期任务 ${delayed} 项，风险任务 ${risk} 项，需要重点跟进责任人排期。

## 下周建议
- 优先清理延期任务，明确里程碑和验收口径。
- 对高风险任务增加每日追踪频率。`;

      return { success: true, output, metadata: buildMeta(startedAt) };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "周报生成失败",
      };
    }
  }

  async analyzeRisk(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);

      if (!isNumericId(input.bizId)) {
        return { success: false, output: "", error: "bizId 必须是任务 ID" };
      }

      const task = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
        select: {
          taskName: true,
          status: true,
          priority: true,
          progress: true,
          dueTime: true,
          riskLevel: true,
        },
      });

      if (!task) {
        return { success: false, output: "", error: "任务不存在或无权限" };
      }

      let score = 20;
      if (task.status === "3") score += 40;
      if (["2", "3"].includes(task.riskLevel ?? "0")) score += 25;
      if ((task.progress == null ? 0 : Number(task.progress)) < 40) score += 10;
      if (task.priority === "0") score += 10;
      if (task.dueTime && task.dueTime.getTime() < Date.now()) score += 15;
      score = Math.min(score, 100);

      const level = score >= 75 ? "高" : score >= 45 ? "中" : "低";
      const output = `任务「${task.taskName}」风险分析结果：
- 风险分数：${score}
- 风险等级：${level}
- 当前状态：${toTaskStatus(task.status)}
- 截止时间：${task.dueTime?.toISOString().slice(0, 10) ?? "未设置"}

建议：
1. 立即确认剩余工作量和责任人计划。
2. 将任务拆分为更小里程碑并每日同步。
3. 对关键阻塞项设置明确截止时间。`;

      return { success: true, output, metadata: buildMeta(startedAt) };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "风险分析失败",
      };
    }
  }

  async generateTaskInsight(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);

      const prompt = [
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
        input.inputText,
      ].join("\n");

      if (hasRealLlm()) {
        const llm = await this.callDeepSeekChat(prompt, ctx, input.bizId);
        const insight = parseStructuredInsight(llm.output) ?? fallbackInsightFromText(llm.output);
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

      const output = `{
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

      return {
        success: true,
        output,
        insight: parseStructuredInsight(output) ?? fallbackInsightFromText(output),
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

  async breakdownTask(params: SkillParams, _ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);
      const topic = input.inputText.trim();

      const output = `任务拆解建议（草稿）：
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
        error: error instanceof Error ? error.message : "任务拆解失败",
      };
    }
  }

  isAvailable(): boolean {
    return env.AI_FEATURE_ENABLED !== false;
  }

  async confirmAction(action: string, params: any, ctx: AuthContext): Promise<AiResponse> {
    const startedAt = Date.now();

    try {
      switch (action) {
        case "deleteTask": {
          const { taskId } = params;
          const hasPermission = await canManageTask(ctx, taskId);
          if (!hasPermission) {
            return { success: false, output: "", error: `你没有任务 ${taskId} 的操作权限` };
          }

          const existing = await prisma.task.findFirst({
            where: { tenantId: ctx.tenantId, id: toDbId(taskId), delFlag: "0" },
            select: { id: true, taskName: true },
          });
          if (!existing) {
            return { success: false, output: "", error: `任务 ${taskId} 不存在或已删除` };
          }

          // 执行删除
          await prisma.task.update({
            where: { id: existing.id },
            data: { delFlag: "1", updateBy: toDbId(ctx.userId), updateTime: new Date() },
          });

          return {
            success: true,
            output: `任务「${existing.taskName}」已删除，已从任务列表移除（这不是“改为已完成”）。`,
            metadata: buildMeta(startedAt),
          };
        }

        // 可以添加其他确认操作，如创建任务、恢复任务、修改状态等

        default:
          return { success: false, output: "", error: `未知的确认操作: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "确认操作执行失败",
      };
    }
  }
}
