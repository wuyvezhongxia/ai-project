import { z } from "zod";
import { idSchema } from "../../common/db-values";

export const idParamsSchema = z.object({
  id: idSchema,
});

export const taskListQuerySchema = z.object({
  projectId: idSchema.optional(),
  scope: z.enum(["all", "owned", "created", "collaborated"]).optional(),
  view: z.enum(["list", "kanban"]).optional(),
  status: z.enum(["0", "1", "2", "3"]).optional(),
  priority: z.string().optional(),
  assigneeUserId: idSchema.optional(),
  creatorUserId: idSchema.optional(),
  favorite: z.enum(["true", "false"]).optional(),
  riskLevel: z.string().optional(),
  dueRange: z.enum(["today", "week", "overdue"]).optional(),
  tagId: idSchema.optional(),
  keyword: z.string().optional(),
});

export const createTaskSchema = z.object({
  projectId: idSchema.optional(),
  taskName: z.string().min(1).max(200),
  taskDesc: z.string().max(5000).optional(),
  assigneeUserId: idSchema.optional(),
  sourceType: z.enum(["manual", "ai", "import"]).optional(),
  taskType: z.enum(["task", "bug", "todo"]).optional(),
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  startTime: z.string().datetime().optional(),
  dueTime: z.string().datetime().optional(),
  estimatedHours: z.number().min(0).optional(),
  actualHours: z.number().min(0).optional(),
  parentTaskId: idSchema.optional(),
  sortNo: z.number().int().optional(),
  collaboratorUserIds: z.array(idSchema).default([]),
  tagIds: z.array(idSchema).default([]),
  attachmentIds: z.array(idSchema).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["0", "1", "2"]).optional(),
  riskLevel: z.enum(["0", "1", "2", "3"]).optional(),
});

export const taskStatusSchema = z.object({
  status: z.enum(["0", "1", "2"]),
});

export const subtaskSchema = z.object({
  subtaskName: z.string().min(1).max(200),
  status: z.enum(["0", "1"]).optional(),
  sortNo: z.number().int().optional(),
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  plannedStartTime: z.string().datetime().optional(),
  plannedDueTime: z.string().datetime().optional(),
  finishTime: z.string().datetime().optional(),
});

const isoDateTimeOrNull = z.union([z.string().datetime(), z.null()]);

export const subtaskUpdateSchema = z.object({
  subtaskName: z.string().min(1).max(200).optional(),
  status: z.enum(["0", "1", "2"]).optional(),
  sortNo: z.number().int().optional(),
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  plannedStartTime: isoDateTimeOrNull.optional(),
  plannedDueTime: isoDateTimeOrNull.optional(),
  finishTime: isoDateTimeOrNull.optional(),
});

export const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentCommentId: idSchema.optional(),
});

export const uploadFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().min(1).max(500),
  fileSize: z.number().int().nonnegative().optional(),
  fileType: z.string().max(50).optional(),
  storageType: z.string().max(20).optional(),
});

export const bindAttachmentsSchema = z.object({
  attachmentIds: z.array(idSchema).min(1),
});

export const createTagSchema = z.object({
  tagName: z.string().min(1).max(50),
  tagColor: z.string().max(20).optional(),
  tagType: z.enum(["project", "task", "common"]).optional(),
});

export const bindTagsSchema = z.object({
  tagIds: z.array(idSchema).min(1),
});

export const relationSchema = z.object({
  relationType: z.enum(["task", "project", "url", "file", "doc"]),
  targetId: idSchema.optional(),
  targetTitle: z.string().min(1).max(200),
  targetUrl: z.string().url().optional(),
});

export const workloadQuerySchema = z.object({
  range: z.enum(["week", "month"]).default("week"),
});

export const relationIdParamsSchema = z.object({
  id: idSchema,
});

export const tagIdParamsSchema = z.object({
  id: idSchema,
  tagId: idSchema,
});

export const attachmentIdParamsSchema = z.object({
  id: idSchema,
  attachmentId: idSchema,
});
