import { cleanQuotedText } from "./ai.text-utils";

export const isNumericId = (value?: string) => Boolean(value && /^\d+$/.test(value));

export const toProjectStatus = (status?: string | null) => {
  if (status === "0") return "进行中";
  if (status === "1") return "已完成";
  if (status === "2") return "已归档";
  if (status === "3") return "已关闭";
  return "未知";
};

export const toTaskStatus = (status?: string | null) => {
  if (status === "0") return "待开始";
  if (status === "1") return "进行中";
  if (status === "2") return "已完成";
  if (status === "3") return "延期";
  return "未知";
};

export const parseLooseDate = (raw: string): Date | null => {
  const compact = raw.trim().replace(/[年/月.-]/g, "-").replace(/日/g, "");
  const pure8 = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (pure8) {
    const y = Number(pure8[1]);
    const m = Number(pure8[2]);
    const d = Number(pure8[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
    return null;
  }
  const normal = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!normal) return null;
  const y = Number(normal[1]);
  const m = Number(normal[2]);
  const d = Number(normal[3]);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt;
  return null;
};

export const toTaskStatusCode = (statusText: string): "0" | "1" | "2" | "3" => {
  if (/已完成|完成/.test(statusText)) return "2";
  if (/进行中/.test(statusText)) return "1";
  if (/延期/.test(statusText)) return "3";
  return "0";
};

export const toTaskPriorityLabel = (priority?: string | null) => {
  if (priority === "3") return "P0";
  if (priority === "2") return "P1";
  if (priority === "1") return "P2";
  if (priority === "0") return "P3";
  return "未设置";
};

export const toTaskPriorityCode = (priorityText: string): "0" | "1" | "2" | "3" => {
  const text = cleanQuotedText(priorityText).toUpperCase();
  if (/P0|紧急/.test(text)) return "3";
  if (/P1|高/.test(text)) return "2";
  if (/P2|中/.test(text)) return "1";
  if (/P3|低/.test(text)) return "0";
  return "1";
};
