import { z } from "zod";

export const StructuredRouterResultSchema = z.discriminatedUnion("route", [
  z.object({
    route: z.literal("operation"),
    op: z.string().min(1),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    route: z.literal("skill"),
    skill_id: z.string().min(1),
  }),
  z.object({
    route: z.literal("general"),
  }),
]);

export type StructuredRouterResult = z.infer<typeof StructuredRouterResultSchema>;
