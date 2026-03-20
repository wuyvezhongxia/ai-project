import { z } from "zod";

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const memberParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
});

export const projectListQuerySchema = z.object({
  keyword: z.string().optional(),
  status: z.string().optional(),
  ownerUserId: z.coerce.number().int().positive().optional(),
  creatorUserId: z.coerce.number().int().positive().optional(),
  joinedOnly: z.enum(["true", "false"]).optional(),
});

export const createProjectSchema = z.object({
  projectCode: z.string().max(50).optional(),
  projectName: z.string().min(1).max(100),
  projectDesc: z.string().max(5000).optional(),
  ownerUserId: z.number().int().positive(),
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  visibility: z.enum(["0", "1", "2"]).optional(),
  memberUserIds: z.array(z.number().int().positive()).default([]),
  tagIds: z.array(z.number().int().positive()).default([]),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["0", "1", "2", "3"]).optional(),
});

export const addMembersSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        roleType: z.enum(["owner", "member", "observer"]).default("member"),
      }),
    )
    .min(1),
});
