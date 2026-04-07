import { env } from "../../../../config/env";
import { hasRealLlm, isStructuredRoutingEnabled } from "../../core/ai.meta";
import { postDeepSeekChatCompletions } from "../deepseek-api";
import { StructuredRouterResultSchema, type StructuredRouterResult } from "./schema";
import { normalizeStructuredRouterPayload } from "./synthetic";

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  return fence?.[1]?.trim() ?? t;
}

function buildSystemPrompt(skillCatalog: string): string {
  return `你是项目管理 AI 的路由器。根据用户最新一句话（及简短上下文提示），输出且仅输出一个 JSON 对象（不要 markdown）。

必须三选一：
1) 业务写操作 / 查单条任务详情 / 改任务属性 / 移动任务 / 发起创建流程 → route="operation"
2) 用户需求与下表某一技能描述高度匹配（周报、批量调整、项目分析、流式周报等）→ route="skill"，skill_id 必须是下表中出现的 id，禁止编造表中不存在的 id
3) 纯闲聊、创意文案、无法对应下表技能且也不属于第 1 类明确指令的开放问答 → route="general"

路由优先级（重要）：
- 若用户明显要「生成周报 / 工作报告 / 工作总结」→ 优先 skill（如 weekly-report 或 weekly-report-streaming，按是否强调流式选）；若涉及「所有项目 / 全部项目 / 各项目」汇总周报 → skill weekly-report-streaming
- 若用户要「批量改状态 / 批量调整 / 把一批任务改为某状态」且已关联项目（bizId 为项目）→ skill batch-adjust
- 若用户要「项目分析 / 重点任务拆解 / 子步骤 / 可执行拆分」→ skill task-breakdown（展示名为项目分析）
- 若用户只是模糊问「最近任务怎样」「帮我看看项目」且未点明上表能力 → route="general"（由通用代理与工具处理列表类问题）
- 凡是明确的删改查单条任务、创建项目/任务等，一律 route="operation"，不要选 skill

operation 时：
- op 必须是下列之一：
  pending_resolve（仅当上方出现 [PENDING_STATE] 且用户表达确认/拒绝时）,
  delete_task, restore_task, view_task,
  update_task_status, update_task_priority, update_task_due,
  begin_modify_task, move_task_to_project,
  create_project, create_task, create_subtask
- pending_resolve 的 args：decision 取 confirm（同意执行）或 cancel（放弃）；不要用中文键
- 其他 op 的 args 用英文键：task_id, task_title, project_name, project_title, status, priority, due, title, conditions

说明：
- task_id 仅为用户明确说出的数字 ID（如「任务 19」「#19」「id 19」）。禁止猜测、禁止把名称里的数字当成 ID（如「ai2」「任务2号」「v2」一律不要用 task_id）。
- 用户用名称/代号指任务（含英文数字混合名如 ai2、bug-17）时：必须使用 task_title 或 conditions.title_contains，不要填 task_id。
- 查看示例：用户说「查看 ai2」→ {"route":"operation","op":"view_task","args":{"task_title":"ai2"}} 或 {"conditions":{"title_contains":"ai2"}}，禁止填写 task_id。
- 「查看 xxx 项目」（句末为「项目」）由服务端按项目名称/编号解析，不要为此编造任务 task_id。
- 用户只说口语目标、没有 ID 时（如「删掉写作任务」）：不要编造 task_id，用 conditions 或 task_title。
- conditions 对象（可选键，均为可选）：title_contains（标题包含）, status（待开始/进行中/已完成/延期）, project_name_contains, due_on（YYYY-MM-DD，截止日为当天）, due_before, due_after。
- 例：删除标题含「写作」的任务 → {"route":"operation","op":"delete_task","args":{"conditions":{"title_contains":"写作"}}}
- 例：取消明天到期的会议类任务 → {"route":"operation","op":"delete_task","args":{"conditions":{"title_contains":"会议","due_on":"2026-04-07"}}}（日期按用户语义填当地日期）
- status 取值示例：待开始、进行中、已完成、延期。
- priority：P0/P1/P2/P3 或 紧急/高/中/低。
- create_project：若用户已给出项目名称，args.project_name；若只说「创建项目」无名称，args 可为空。
- create_task：若 title、due、project_name 齐全可一并放入 args；若信息不全可 op=create_task 且仅部分字段，由系统追问。

技能目录（仅启用中的会列出在下方）：
${skillCatalog}

JSON 形状示例：
{"route":"operation","op":"delete_task","args":{"task_id":"19"}}
{"route":"operation","op":"pending_resolve","args":{"decision":"confirm"}}
{"route":"skill","skill_id":"weekly-report"}
{"route":"general"}`;
}

/**
 * 调用 DeepSeek，优先使用 json_object 响应格式；失败则解析正文 JSON。
 */
export async function fetchStructuredRouterResult(
  userText: string,
  opts: { bizId?: string; skillCatalog: string; pendingContextBlock?: string | null },
): Promise<StructuredRouterResult | null> {
  if (!isStructuredRoutingEnabled() || !hasRealLlm() || !env.DEEPSEEK_API_KEY) return null;

  const prefix = [
    opts.pendingContextBlock?.trim(),
    opts.bizId ? `[当前关联业务ID bizId=${opts.bizId}]` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const user =
    (prefix ? `${prefix}\n` : "") + `用户输入：${userText.trim().slice(0, 4000)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.AI_REQUEST_TIMEOUT, 20000));

  const bodyBase = {
    model: env.DEEPSEEK_MODEL,
    messages: [
      { role: "system" as const, content: buildSystemPrompt(opts.skillCatalog) },
      { role: "user" as const, content: user },
    ],
    temperature: 0,
    max_tokens: 800,
  };

  const tryParse = (text: string): StructuredRouterResult | null => {
    const normalized = normalizeStructuredRouterPayload(JSON.parse(stripJsonFence(text)));
    if (!normalized) return null;
    const parsed = StructuredRouterResultSchema.safeParse(normalized);
    return parsed.success ? parsed.data : null;
  };

  try {
    let response = await postDeepSeekChatCompletions(
      { ...bodyBase, response_format: { type: "json_object" } },
      { signal: controller.signal },
    );

    if (!response.ok) {
      response = await postDeepSeekChatCompletions(bodyBase, { signal: controller.signal });
    }

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return null;
    try {
      return tryParse(content);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
