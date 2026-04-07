import type { AuthContext } from "../../../common/types";
import { env } from "../../../config/env";
import { hasRealLlm } from "../core/ai.meta";
import { postDeepSeekChatCompletions } from "./deepseek-api";
import type { ChatTurnState } from "../chat/chat-host";
type LlmOperationParse = {
  is_operation: boolean;
  canonical_command: string | null;
};

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  return fence?.[1]?.trim() ?? t;
}

function parseLlmOperationJson(output: string): LlmOperationParse | null {
  try {
    const text = stripJsonFence(output);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const isOp = o.is_operation === true;
    const cmd = o.canonical_command;
    const canonical =
      typeof cmd === "string" && cmd.trim().length > 0 ? cmd.trim() : null;
    return { is_operation: isOp, canonical_command: canonical };
  } catch {
    return null;
  }
}

/** 避免模型误报：规范化句里应含业务动词或对象之一 */
export function looksLikeOperationCommand(text: string): boolean {
  return /(删除|移除|恢复|还原|创建|新建|添加|状态|优先级|截止|到期|查看|查询|详情|修改|更新|调整|移动|子任务|项目|任务)/.test(
    text,
  );
}

const OPERATION_INTENT_SYSTEM = `你是项目管理助手的「意图规范化」模块。根据用户输入判断是否在为**明确的业务操作**下指令（增删改查任务/项目、改状态/优先级/截止时间、查看某任务详情等）。
只输出一个 JSON 对象，不要 markdown，不要解释。

字段：
- is_operation: boolean — 仅当用户**明确要执行或发起**上述操作时 true；闲聊、问进度、问建议、模糊咨询、没有可操作目标时为 false。
- canonical_command: string | null — 当 is_operation 为 true 时，输出**一行中文标准指令**，必须让后续规则引擎能解析。尽量使用下列句式（按语义择一）：
  - 删除任务 <数字ID 或 任务标题>
  - 恢复任务 <数字ID 或 任务标题>
  - 将任务 <数字ID 或 任务名> 状态改为 待开始|进行中|已完成|延期
  - 将任务 <ID或名> 优先级改为 P0|P1|P2|P3（或 紧急|高|中|低）
  - 将任务 <ID或名> 截止时间改为 <可解析日期，如 2026-08-18>
  - 修改任务 <任务名或ID>（仅当用户想改任务但未说清改哪一项时）
  - 创建项目 <项目名>
  - 创建任务（仅当用户明确要新建任务且未给标题等多字段时）
  - 创建子任务（若用户明确要加子任务）
  - 查看任务 <数字ID>
  - 查看任务 <任务名>（若用户用名称查详情）

若用户同时说了多步，只抽取**当前最主要的一条**写成 canonical_command。
若 is_operation 为 false，canonical_command 必须为 null。`;

/**
 * 用 LLM 将口语转为可对接现有正则/extractor 的标准指令（不替代 pending 多轮确认）。
 */
export async function parseOperationIntentWithLlm(userText: string): Promise<LlmOperationParse | null> {
  if (!hasRealLlm() || !env.DEEPSEEK_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.AI_REQUEST_TIMEOUT, 15000));

  try {
    const response = await postDeepSeekChatCompletions(
      {
        model: env.DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: OPERATION_INTENT_SYSTEM },
          { role: "user", content: userText.trim().slice(0, 4000) },
        ],
        temperature: 0,
        max_tokens: 400,
      },
      { signal: controller.signal },
    );

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const output = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!output) return null;
    return parseLlmOperationJson(output);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function chatTurnHasAnyPendingRecord(s: ChatTurnState): boolean {
  return Boolean(
    s.pendingConfirm ||
      s.pendingDeleteBatch ||
      s.pendingTaskDisambiguation ||
      s.pendingCreate ||
      s.pendingProjectCreate ||
      s.pendingSubtaskCreate ||
      s.pendingStructured ||
      s.pendingInferred ||
      (s.pendingModifyTarget && s.hasAlivePendingModify),
  );
}

/**
 * 正则未命中时，用 LLM 补一层；命中后改写 state.question 走既有 explicit 链。
 */
export async function maybeApplyLlmExplicitOperationAugmentation(
  state: ChatTurnState,
  _ctx: AuthContext,
): Promise<void> {
  if (state.isExplicitOperation) return;
  if (!hasRealLlm()) return;
  if (chatTurnHasAnyPendingRecord(state)) return;

  const parsed = await parseOperationIntentWithLlm(state.input.inputText);
  if (!parsed?.is_operation || !parsed.canonical_command) return;
  const cmd = parsed.canonical_command.trim();
  if (!looksLikeOperationCommand(cmd)) return;

  state.isExplicitOperation = true;
  state.relaxExplicitOperationFailure = true;
  state.question = cmd;
  state.q = cmd.toLowerCase();
}
