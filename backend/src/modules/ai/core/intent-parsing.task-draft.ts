import { parseLooseDate } from "./ai.domain-format";
import type { CreateTaskDraft } from "./ai.types";
import { cleanQuotedText, normalizeTaskTitle } from "./ai.text-utils";

export const extractCreateTaskDraft = (text: string): CreateTaskDraft | null => {
  const explicitCreate = text.match(/(?:创建|新建|建立|添加).{0,8}任务(?:，|,|：|:)?(?:叫|名为|名称是)?\s*([^\n]+)/);
  if (explicitCreate?.[1]) {
    const title = normalizeTaskTitle(explicitCreate[1]);
    if (!title) return null;
    return { title };
  }

  const infoStyle = text.match(/^(.+?)[,，]\s*属于\s*(.+?)\s*项目(?:[,，]\s*([^,，\s]{3,32}))?\s*$/);
  if (infoStyle?.[1]) {
    const title = normalizeTaskTitle(infoStyle[1]);
    const projectName = cleanQuotedText(infoStyle[2] ?? "");
    const dueAtRaw = (infoStyle[3] ?? "").trim();
    const dueAt = dueAtRaw ? parseLooseDate(dueAtRaw) ?? undefined : undefined;
    if (!title) return null;
    return { title, projectName: projectName || undefined, dueAt };
  }

  const compactStyle = text.match(/^(.+?)[,，]\s*(.+?)\s*项目(?:[,，]\s*([^,，\s]{3,32}))?\s*$/);
  if (compactStyle?.[1]) {
    const title = normalizeTaskTitle(compactStyle[1]);
    const projectName = cleanQuotedText(compactStyle[2] ?? "");
    const dueAtRaw = (compactStyle[3] ?? "").trim();
    const dueAt = dueAtRaw ? parseLooseDate(dueAtRaw) ?? undefined : undefined;
    if (!title) return null;
    return { title, projectName: projectName || undefined, dueAt };
  }

  return null;
};

export const extractProjectNameReply = (text: string): string => {
  const firstPart = text
    .split(/[,，\n]/)
    .map((item) => cleanQuotedText(item))
    .find(Boolean);
  return firstPart ? normalizeTaskTitle(firstPart) : "";
};

export const extractSubtaskDraft = (text: string): { title?: string; taskId?: string } => {
  const patternA = text.match(
    /(?:创建|新建|添加)?\s*子任务(?:，|,|：|:)?\s*([^\n,，。]+?)(?:\s*(?:到|给|归属|属于|在).{0,3}任务\s*(\d+))?\s*$/,
  );
  const patternB = text.match(
    /在任务\s*(\d+).{0,4}(?:创建|新建|添加)?\s*子任务(?:，|,|：|:)?\s*([^\n,，。]+)\s*$/,
  );
  const patternC = text.match(/^([^\n,，。]+?)\s*[,，]\s*(\d+)\s*$/);
  const patternD = text.match(/^([^\n,，。]+?)\s*(?:到|给|归属|属于|在).{0,3}任务\s*(\d+)\s*$/);

  const taskId = patternA?.[2] || patternB?.[1] || patternC?.[2] || patternD?.[2] || "";
  const title = normalizeTaskTitle(patternA?.[1] || patternB?.[2] || patternC?.[1] || patternD?.[1] || "");

  return {
    title: title || undefined,
    taskId: taskId || undefined,
  };
};
