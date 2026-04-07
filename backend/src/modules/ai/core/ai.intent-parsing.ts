import { parseLooseDate, toTaskPriorityCode, toTaskStatusCode } from "./ai.domain-format";
import type {
  MoveTaskToProjectTarget,
  UpdateTaskDueTarget,
  UpdateTaskPriorityTarget,
  UpdateTaskStatusTarget,
  ViewTaskDetailTarget,
} from "./ai.types";
import { cleanQuotedText, normalizeTaskTitle } from "./ai.text-utils";
import { extractCreateTaskDraft, extractProjectNameReply, extractSubtaskDraft } from "./intent-parsing.task-draft";

export const parseLooseStructuredFields = (text: string): { first: string; mention?: string; dueAt?: Date } | null => {
  const parts = text
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const first = cleanQuotedText(parts[0] ?? "");
  if (!first) return null;
  const mentionPart = parts.find((p) => /^@\S+/.test(p));
  const datePart = parts.find((p) => Boolean(parseLooseDate(p)));
  return {
    first,
    mention: mentionPart ? mentionPart.replace(/^@/, "") : undefined,
    dueAt: datePart ? parseLooseDate(datePart) ?? undefined : undefined,
  };
};

export const inferActionFromStructuredFields = (
  parsed: { first: string; mention?: string; dueAt?: Date },
  bizId?: string,
): { action: "createTask" | "createProject"; confidence: number } => {
  const hasProjectWord = /项目/.test(parsed.first);
  if (hasProjectWord) {
    return { action: "createProject", confidence: 0.92 };
  }

  if (bizId && /^\d+$/.test(bizId)) {
    return { action: "createTask", confidence: 0.72 };
  }

  const score = (parsed.mention ? 0.35 : 0) + (parsed.dueAt ? 0.35 : 0) + (parsed.first.length >= 2 ? 0.2 : 0);
  return { action: "createProject", confidence: Math.min(0.85, 0.45 + score) };
};

export const isLikelyStructuredFieldsText = (text: string): boolean =>
  /[,，]/.test(text) &&
  (/@\S+/.test(text) || /\d{6,8}|20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(text));

export const hasUnverifiedCreateClaim = (text: string): boolean => {
  if (!text) return false;
  const claim = /(?:任务|项目)?.{0,6}(?:已)?创建成功|创建完成|已创建/.test(text);
  if (!claim) return false;
  const hasId = /(?:^|\n)\s*[-*]?\s*ID[:：]\s*\d+/.test(text) || /(?:任务|项目)\s*ID[:：]?\s*\d+/.test(text);
  return !hasId;
};

const TASK_TITLE_LABEL_RE = /(?:任务标题|标题)/;
const TASK_DUE_LABEL_RE = /(?:截止时间|截止日期|到期时间|到期日期|到期|due)/i;
const TASK_PROJECT_LABEL_RE = /(?:关联项目|所属项目|项目)/;

const TASK_TITLE_FIELD_RE = new RegExp(`${TASK_TITLE_LABEL_RE.source}\\s*[:：]`);
const TASK_DUE_FIELD_RE = new RegExp(`${TASK_DUE_LABEL_RE.source}\\s*[:：]`, "i");
const TASK_PROJECT_FIELD_RE = new RegExp(`${TASK_PROJECT_LABEL_RE.source}\\s*[:：]`);

const extractLabeledField = (text: string, labelPattern: RegExp): string => {
  const source = text.replace(/\r/g, "");
  const lineRegex = new RegExp(`^\\s*${labelPattern.source}\\s*[:：]\\s*(.+?)\\s*$`, `m${labelPattern.flags.includes("i") ? "i" : ""}`);
  const matched = source.match(lineRegex);
  return cleanQuotedText((matched?.[1] ?? "").trim());
};

export const isTaskFormText = (text: string): boolean =>
  TASK_TITLE_FIELD_RE.test(text) &&
  TASK_DUE_FIELD_RE.test(text) &&
  TASK_PROJECT_FIELD_RE.test(text);

export const extractTaskFormDraft = (text: string): { title?: string; dueAt?: Date; projectName?: string } => {
  const title = extractLabeledField(text, TASK_TITLE_LABEL_RE);
  const dueRaw = extractLabeledField(text, TASK_DUE_LABEL_RE);
  const projectName = extractLabeledField(text, TASK_PROJECT_LABEL_RE);
  return {
    title: title || undefined,
    dueAt: dueRaw ? parseLooseDate(dueRaw) ?? undefined : undefined,
    projectName: projectName || undefined,
  };
};

export { extractCreateTaskDraft, extractProjectNameReply, extractSubtaskDraft };

export const extractUpdateTaskStatusTarget = (text: string): UpdateTaskStatusTarget | null => {
  const statusToken = "(?:[\"“”‘’'「」『』])?(待开始|进行中|已完成|完成|延期)(?:[\"“”‘’'「」『』])?";
  const patterns = [
    new RegExp(`(?:把|将)?\\s*任务\\s*(.+?)\\s*(?:改为|设为|标记为)\\s*${statusToken}`),
    new RegExp(`(?:把|将)?\\s*(.+?)\\s*任务\\s*(?:改为|设为|标记为)\\s*${statusToken}`),
    new RegExp(`(?:把|将)?\\s*(.+?)\\s*(?:任务)?(?:的)?状态\\s*(?:改为|改成|设为|标记为)\\s*${statusToken}`),
    new RegExp(`(?:把|将)?\\s*(.+?)\\s*(?:改为|改成|设为|标记为)\\s*${statusToken}`),
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1] || !matched?.[2]) continue;
    const rawTarget = cleanQuotedText(matched[1]).replace(/^[\"“”‘’'「」『』]+|[\"“”‘’'「」『』]+$/g, "");
    const coreName = cleanQuotedText(
      rawTarget
        .replace(/^任务/, "")
        .replace(/任务$/, "")
        .replace(/(?:的)?状态$/, "")
        .trim(),
    );
    if (!coreName) continue;
    return {
      raw: rawTarget,
      coreName,
      status: toTaskStatusCode(matched[2]),
    };
  }
  return null;
};

export const extractUpdateTaskPriorityTarget = (text: string): UpdateTaskPriorityTarget | null => {
  const priorityToken = "(P[0-3]|紧急|高|中|低)";
  const patterns = [
    new RegExp(`(?:把|将)?\\s*任务\\s*(.+?)\\s*(?:优先级)?\\s*(?:改为|改成|设为|调整为|标记为)\\s*${priorityToken}`),
    new RegExp(`(?:把|将)?\\s*(.+?)\\s*任务\\s*(?:优先级)?\\s*(?:改为|改成|设为|调整为|标记为)\\s*${priorityToken}`),
    new RegExp(`(?:把|将)?\\s*(.+?)\\s*(?:的)?优先级\\s*(?:改为|改成|设为|调整为|标记为)\\s*${priorityToken}`),
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1] || !matched?.[2]) continue;
    const rawTarget = cleanQuotedText(matched[1]).replace(/^[\"“”‘’'「」『』]+|[\"“”‘’'「」『』]+$/g, "");
    const coreName = cleanQuotedText(
      rawTarget
        .replace(/^任务/, "")
        .replace(/任务$/, "")
        .replace(/(?:的)?优先级$/, "")
        .trim(),
    );
    if (!coreName) continue;
    return {
      raw: rawTarget,
      coreName,
      priority: toTaskPriorityCode(matched[2]),
    };
  }
  return null;
};

export const extractUpdateTaskDueTarget = (text: string): UpdateTaskDueTarget | null => {
  const patterns = [
    /(?:把|将)?\s*任务\s*(.+?)\s*(?:截止时间|截止日期|到期时间|到期日期|截止|到期)\s*(?:改为|改成|设为|调整为)\s*(.+)\s*$/,
    /(?:把|将)?\s*(.+?)\s*任务\s*(?:截止时间|截止日期|到期时间|到期日期|截止|到期)\s*(?:改为|改成|设为|调整为)\s*(.+)\s*$/,
    /(?:把|将)?\s*(.+?)\s*(?:的)?(?:截止时间|截止日期|到期时间|到期日期|截止|到期)\s*(?:改为|改成|设为|调整为)\s*(.+)\s*$/,
  ];
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1] || !matched?.[2]) continue;
    const rawTarget = cleanQuotedText(matched[1]).replace(/^[\"“”‘’'「」『』]+|[\"“”‘’'「」『』]+$/g, "");
    const dueText = cleanQuotedText(matched[2]);
    const coreName = cleanQuotedText(
      rawTarget
        .replace(/^任务/, "")
        .replace(/任务$/, "")
        .replace(/(?:的)?(?:截止时间|截止日期|到期时间|到期日期|截止|到期)$/, "")
        .trim(),
    );
    if (!coreName) continue;
    const noDue = /无截止时间|不设置截止|不需要截止|无截止|清空截止|取消截止/.test(dueText);
    const dueAt = noDue ? null : parseLooseDate(dueText);
    if (!noDue && !dueAt) continue;
    return { raw: rawTarget, coreName, dueAt };
  }
  return null;
};

export const extractMoveTaskToProjectTarget = (text: string): MoveTaskToProjectTarget | null => {
  const patterns = [
    /(?:把|将)?\s*任务\s*(.+?)\s*(?:移动到|移到|挪到|转到|放到)\s*项目\s*(.+?)\s*$/,
    /(?:把|将)?\s*(.+?)\s*任务\s*(?:移动到|移到|挪到|转到|放到)\s*项目\s*(.+?)\s*$/,
    /(?:移动|移到|挪到|转到)\s*任务\s*(.+?)\s*(?:到|至)\s*项目\s*(.+?)\s*$/,
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1] || !matched?.[2]) continue;
    const taskRaw = cleanQuotedText(matched[1]);
    const projectRaw = cleanQuotedText(matched[2]);
    const taskCoreName = cleanQuotedText(taskRaw.replace(/^任务/, "").replace(/任务$/, ""));
    const projectCoreName = cleanQuotedText(projectRaw.replace(/^项目/, "").replace(/项目$/, ""));
    if (!taskCoreName || !projectCoreName) continue;
    return { taskRaw, taskCoreName, projectRaw, projectCoreName };
  }
  return null;
};

export const extractViewTaskDetailTarget = (text: string): ViewTaskDetailTarget | null => {
  const patterns = [
    /(?:查看|查询|详情)\s*任务\s*(.+)\s*$/,
    /(?:查看|查询|详情)\s*(.+?)\s*任务\s*$/,
    /(?:查看|查询|详情)\s*(.+)\s*$/,
  ];
  let rawTarget = "";
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      rawTarget = cleanQuotedText(matched[1]);
      if (rawTarget) break;
    }
  }
  if (!rawTarget) return null;

  rawTarget = rawTarget.replace(/(?:吧|一下|好吗|可以吗|行吗)\s*$/g, "").trim();
  const parenthesized = rawTarget.match(/^(.*?)[(（]\s*([^()（）]+)\s*[)）]\s*$/);
  let coreName = cleanQuotedText(parenthesized?.[1] ?? rawTarget);
  const hintText = parenthesized?.[2] ?? "";
  const hintTokens = hintText
    .split(/[,，、/]/)
    .map((item) => cleanQuotedText(item))
    .filter(Boolean);
  const statusToken = hintTokens.find((token) => /待开始|进行中|已完成|完成|延期/.test(token));
  const projectToken = hintTokens.find((token) => token !== statusToken);

  coreName = cleanQuotedText(coreName.replace(/^任务/, "").replace(/任务$/, ""));
  if (!coreName) coreName = rawTarget;
  if (!coreName) return null;

  return {
    raw: rawTarget,
    coreName,
    projectHint: projectToken,
    statusHint: statusToken,
  };
};

export const extractModifyTaskIntentTarget = (text: string): { raw: string; coreName: string } | null => {
  const patterns = [
    /(?:修改|更新|调整)\s*任务\s*(.+?)\s*$/,
    /(?:修改|更新|调整)\s*(.+?)\s*任务\s*$/,
  ];
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1]) continue;
    const raw = cleanQuotedText(matched[1]);
    const coreName = cleanQuotedText(raw.replace(/^任务/, "").replace(/任务$/, ""));
    if (!coreName) continue;
    return { raw, coreName };
  }
  return null;
};

export const extractBareStatusChange = (text: string): "0" | "1" | "2" | "3" | null => {
  const matched = text.match(/(?:任务)?状态\s*(?:改为|改成|设为|标记为)\s*(待开始|进行中|已完成|完成|延期)/);
  if (!matched?.[1]) return null;
  return toTaskStatusCode(matched[1]);
};

export const extractBarePriorityChange = (text: string): "0" | "1" | "2" | "3" | null => {
  const matched = text.match(/优先级\s*(?:改为|改成|设为|调整为|标记为)\s*(P[0-3]|紧急|高|中|低)/i);
  if (!matched?.[1]) return null;
  return toTaskPriorityCode(matched[1]);
};

export const extractBareDueChange = (text: string): Date | null | undefined => {
  const matched = text.match(/(?:截止时间|截止日期|到期时间|到期日期|截止|到期)\s*(?:改为|改成|设为|调整为)\s*(.+)\s*$/);
  if (!matched?.[1]) return undefined;
  const dueText = cleanQuotedText(matched[1]);
  if (/无截止时间|不设置截止|不需要截止|无截止|清空截止|取消截止/.test(dueText)) return null;
  const parsed = parseLooseDate(dueText);
  return parsed ?? undefined;
};

export const isPredefinedOperationText = (text: string): boolean => {
  const lowerText = text.toLowerCase();
  if (/(?:创建|新建|建立|添加).{0,8}项目/.test(lowerText)) return true;
  if (/^(?:请|帮我|麻烦|可以)?\s*(?:创建|新建|建立|添加)\s*任务\s*$/.test(lowerText)) return true;
  if (extractMoveTaskToProjectTarget(text)) return true;
  if (extractCreateTaskDraft(text)) return true;
  if (isTaskFormText(text)) return true;
  if (/(?:创建|新建|添加).{0,4}子任务/.test(lowerText)) return true;
  if (extractUpdateTaskStatusTarget(text)) return true;
  if (extractUpdateTaskPriorityTarget(text)) return true;
  if (extractUpdateTaskDueTarget(text)) return true;
  if (extractModifyTaskIntentTarget(text)) return true;
  if (/(?:把|将)?.{0,18}(?:任务)?.{0,18}(?:状态)?.{0,4}(?:改为|改成|设为|标记为).{0,6}(待开始|进行中|已完成|完成|延期)/.test(text)) return true;
  if (extractViewTaskDetailTarget(text)) return true;
  if (/(?:查看|查询|详情).{0,4}任务\s*(\d+)/.test(lowerText)) return true;
  return false;
};
