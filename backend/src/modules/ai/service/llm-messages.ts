import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";
import { env } from "../../../config/env";
import { isNumericId } from "../core/ai.domain-format";
import { hasRealLlm } from "../core/ai.meta";
import { hasUnverifiedCreateClaim } from "../core/ai.intent-parsing";
import { postDeepSeekChatCompletions } from "./deepseek-api";
import type { LlmMessage } from "../core/ai.types";
import { buildAiChatContext } from "./chat-context";

export async function buildConversationMessagesForChat(
  ctx: AuthContext,
  bizId?: string,
): Promise<LlmMessage[]> {
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

export async function buildModelMessagesForChat(
  inputText: string,
  ctx: AuthContext,
  bizId?: string,
): Promise<LlmMessage[]> {
  const [context, history] = await Promise.all([
    buildAiChatContext(ctx, bizId),
    buildConversationMessagesForChat(ctx, bizId),
  ]);

  const systemPrompt = `
# 角色设定
你是项目管理系统的智能工作助手，名字叫"小P"。你的目标是帮助用户高效管理项目、任务和团队协作。

# 核心能力
1. **主动思考**：不只是回答问题，要分析用户的深层需求，识别潜在风险，提出建设性建议。
2. **对话式交互**：像真人同事一样聊天，语气亲切自然，避免机械式回答。
3. **深度追问**：当信息不足时，主动提出最小化、具体的问题来获取必要信息。
4. **可执行建议**：提供的建议要具体、可操作，最好能给出明确的下一步行动。
5. **术语准确**：创建项目时，项目名字段一律称为“项目名称”，不要写成“项目描述”。

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

export async function callDeepSeekChatNonStreaming(
  inputText: string,
  ctx: AuthContext,
  bizId?: string,
): Promise<{ output: string; tokensUsed: number }> {
  if (!hasRealLlm() || !env.DEEPSEEK_API_KEY) {
    throw new Error("未配置 DEEPSEEK_API_KEY，无法调用真实模型");
  }

  const messages = await buildModelMessagesForChat(inputText, ctx, bizId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT);

  try {
    const response = await postDeepSeekChatCompletions(
      {
        model: env.DEEPSEEK_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: env.AI_MAX_TOKENS_PER_REQUEST,
      },
      { signal: controller.signal },
    );

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
    if (hasUnverifiedCreateClaim(output)) {
      throw new Error("检测到未校验的“创建成功”回复（缺少ID），已拦截");
    }
    return {
      output,
      tokensUsed: data.usage?.total_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
