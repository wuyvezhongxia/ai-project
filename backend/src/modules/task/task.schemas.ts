import { z } from "zod";

export const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const taskListQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  scope: z.enum(["all", "owned", "created", "collaborated"]).optional(),
  view: z.enum(["list", "kanban"]).optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeUserId: z.coerce.number().int().positive().optional(),
  creatorUserId: z.coerce.number().int().positive().optional(),
  favorite: z.enum(["true", "false"]).optional(),
  riskLevel: z.string().optional(),
  dueRange: z.enum(["today", "week", "overdue"]).optional(),
  tagId: z.coerce.number().int().positive().optional(),
  keyword: z.string().optional(),
});

export const createTaskSchema = z.object({
  projectId: z.number().int().positive().optional(),
  taskName: z.string().min(1).max(200),
  taskDesc: z.string().max(5000).optional(),
  assigneeUserId: z.number().int().positive().optional(),
  sourceType: z.enum(["manual", "ai", "import"]).optional(),
  taskType: z.enum(["task", "bug", "todo"]).optional(),
  priority: z.enum(["0", "1", "2", "3"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  startTime: z.string().datetime().optional(),
  dueTime: z.string().datetime().optional(),
  estimatedHours: z.number().min(0).optional(),
  actualHours: z.number().min(0).optional(),
  parentTaskId: z.number().int().positive().optional(),
  sortNo: z.number().int().optional(),
  collaboratorUserIds: z.array(z.number().int().positive()).default([]),
  tagIds: z.array(z.number().int().positive()).default([]),
  attachmentIds: z.array(z.number().int().positive()).default([]),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["0", "1", "2", "3", "4"]).optional(),
  riskLevel: z.enum(["0", "1", "2", "3"]).optional(),
});

export const taskStatusSchema = z.object({
  status: z.enum(["0", "1", "2", "3", "4"]),
});

export const subtaskSchema = z.object({
  subtaskName: z.string().min(1).max(200),
  status: z.enum(["0", "1"]).optional(),
  sortNo: z.number().int().optional(),
});

export const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentCommentId: z.number().int().positive().optional(),
});

export const uploadFileSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().min(1).max(500),
  fileSize: z.number().int().nonnegative().optional(),
  fileType: z.string().max(50).optional(),
  storageType: z.string().max(20).optional(),
});

export const bindAttachmentsSchema = z.object({
  attachmentIds: z.array(z.number().int().positive()).min(1),
});

export const createTagSchema = z.object({
  tagName: z.string().min(1).max(50),
  tagColor: z.string().max(20).optional(),
  tagType: z.enum(["project", "task", "common"]).optional(),
});

export const bindTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()).min(1),
});

export const relationSchema = z.object({
  relationType: z.enum(["task", "project", "url", "file", "doc"]),
  targetId: z.number().int().positive().optional(),
  targetTitle: z.string().min(1).max(200),
  targetUrl: z.string().url().optional(),
});

export const workloadQuerySchema = z.object({
  range: z.enum(["week", "month"]).default("week"),
});

export const relationIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const tagIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  tagId: z.coerce.number().int().positive(),
});

export const attachmentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  attachmentId: z.coerce.number().int().positive(),
});
