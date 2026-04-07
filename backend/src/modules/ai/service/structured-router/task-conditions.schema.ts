import { z } from "zod";

/**
 * 结构化路由 args.conditions：由 LLM 填写，用于在无语境任务 ID 时检索任务。
 */
export const TaskQueryConditionsSchema = z
  .object({
    title_contains: z.string().optional(),
    status: z.string().optional(),
    project_name_contains: z.string().optional(),
    due_on: z.string().optional(),
    due_before: z.string().optional(),
    due_after: z.string().optional(),
  })
  .strict();

export type TaskQueryConditions = z.infer<typeof TaskQueryConditionsSchema>;

export function parseTaskQueryConditions(raw: unknown): TaskQueryConditions | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = TaskQueryConditionsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function conditionsHaveAnyField(c: TaskQueryConditions): boolean {
  return Object.values(c).some((v) => typeof v === "string" && v.trim().length > 0);
}
