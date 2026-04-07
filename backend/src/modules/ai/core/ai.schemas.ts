import { z } from "zod";

export const chatSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().optional(),
});

export const skillSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().min(1),
});

export type ChatParams = z.infer<typeof chatSchema>;
export type SkillParams = z.infer<typeof skillSchema>;

export const taskInsightSchema = z.object({
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
