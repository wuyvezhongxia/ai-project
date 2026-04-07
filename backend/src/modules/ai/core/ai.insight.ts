import { z } from "zod";
import { taskInsightSchema } from "./ai.schemas";

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

export const parseStructuredInsight = (raw: string): z.infer<typeof taskInsightSchema> | null => {
  const jsonText = extractJsonObjectText(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return taskInsightSchema.parse(parsed);
  } catch {
    return null;
  }
};

export const fallbackInsightFromText = (text: string): z.infer<typeof taskInsightSchema> => {
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
