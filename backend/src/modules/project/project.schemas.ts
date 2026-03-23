import { z } from "zod";
import { idSchema } from "../../common/db-values";

export const idParamsSchema = z.object({
  id: idSchema,
});

export const memberParamsSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

export const projectListQuerySchema = z.object({
  keyword: z.string().optional(),
  status: z.string().optional(),
  ownerUserId: idSchema.optional(),
  creatorUserId: idSchema.optional(),
  joinedOnly: z.enum(["true", "false"]).optional(),
});

export const createProjectSchema = z.object({
  projectCode: z.string().max(50).optional(),
  projectName: z.string().min(1).max(100),
  projectDesc: z.string().max(5000).optional(),
  ownerUserId: idSchema,
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  visibility: z.enum(["0", "1", "2"]).optional(),
  memberUserIds: z.array(idSchema).default([]),
  tagIds: z.array(idSchema).default([]),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["0", "1", "2", "3"]).optional(),
});

export const addMembersSchema = z.object({
  members: z
    .array(
      z.object({
        userId: idSchema,
        roleType: z.enum(["owner", "member", "observer"]).default("member"),
      }),
    )
    .min(1),
});
