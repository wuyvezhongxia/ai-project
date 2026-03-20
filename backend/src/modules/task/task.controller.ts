import type { Response } from "express";

import { ok, parseBody, parseParams, parseQuery } from "../../common/http";
import type { AuthedRequest } from "../../common/types";
import {
  attachmentIdParamsSchema,
  bindAttachmentsSchema,
  bindTagsSchema,
  commentSchema,
  createTagSchema,
  createTaskSchema,
  idParamsSchema,
  relationIdParamsSchema,
  relationSchema,
  subtaskSchema,
  tagIdParamsSchema,
  taskListQuerySchema,
  taskStatusSchema,
  updateTaskSchema,
  uploadFileSchema,
  workloadQuerySchema,
} from "./task.schemas";
import { taskService } from "./task.service";

export const listTasks = (req: AuthedRequest, res: Response) => {
  const query = parseQuery(taskListQuerySchema, req.query);
  ok(res, taskService.list(req.ctx, query));
};

export const createTask = (req: AuthedRequest, res: Response) => {
  const body = parseBody(createTaskSchema, req.body);
  ok(res, taskService.create(req.ctx, body), "Task created", 201);
};

export const getTaskDetail = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.detail(req.ctx, params.id));
};

export const updateTask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(updateTaskSchema, req.body);
  ok(res, taskService.update(req.ctx, params.id, body), "Task updated");
};

export const deleteTask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.remove(req.ctx, params.id), "Task deleted");
};

export const updateTaskStatus = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(taskStatusSchema, req.body);
  ok(res, taskService.updateStatus(req.ctx, params.id, body), "Task status updated");
};

export const favoriteTask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.favorite(req.ctx, params.id), "Task favorited");
};

export const unfavoriteTask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.unfavorite(req.ctx, params.id), "Task unfavorited");
};

export const getTaskDashboard = (req: AuthedRequest, res: Response) => {
  ok(res, taskService.dashboard(req.ctx));
};

export const getMustDoToday = (req: AuthedRequest, res: Response) => {
  ok(res, taskService.mustDoToday(req.ctx));
};

export const getRiskTasks = (req: AuthedRequest, res: Response) => {
  ok(res, taskService.riskList(req.ctx));
};

export const getTodoTasks = (req: AuthedRequest, res: Response) => {
  const query = parseQuery(taskListQuerySchema, req.query);
  ok(res, taskService.todo(req.ctx, query));
};

export const listSubtasks = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.listSubtasks(req.ctx, params.id));
};

export const createSubtask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(subtaskSchema, req.body);
  ok(res, taskService.createSubtask(req.ctx, params.id, body), "Subtask created", 201);
};

export const updateSubtask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(subtaskSchema.partial(), req.body);
  ok(res, taskService.updateSubtask(req.ctx, params.id, body), "Subtask updated");
};

export const deleteSubtask = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.deleteSubtask(req.ctx, params.id), "Subtask deleted");
};

export const listComments = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.listComments(req.ctx, params.id));
};

export const createComment = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(commentSchema, req.body);
  ok(res, taskService.createComment(req.ctx, params.id, body), "Comment created", 201);
};

export const updateComment = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(commentSchema, req.body);
  ok(res, taskService.updateComment(req.ctx, params.id, body), "Comment updated");
};

export const deleteComment = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.deleteComment(req.ctx, params.id), "Comment deleted");
};

export const uploadFile = (req: AuthedRequest, res: Response) => {
  const body = parseBody(uploadFileSchema, req.body);
  ok(res, taskService.uploadFile(req.ctx, body), "Attachment uploaded", 201);
};

export const listAttachments = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.listAttachments(req.ctx, params.id));
};

export const bindAttachments = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(bindAttachmentsSchema, req.body);
  ok(res, taskService.bindAttachments(req.ctx, params.id, body), "Attachments bound", 201);
};

export const unbindAttachment = (req: AuthedRequest, res: Response) => {
  const params = parseParams(attachmentIdParamsSchema, req.params);
  ok(res, taskService.unbindAttachment(req.ctx, params.id, params.attachmentId), "Attachment unbound");
};

export const deleteAttachment = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.deleteAttachment(req.ctx, params.id), "Attachment deleted");
};

export const listTags = (req: AuthedRequest, res: Response) => {
  ok(res, taskService.listTags(req.ctx));
};

export const createTag = (req: AuthedRequest, res: Response) => {
  const body = parseBody(createTagSchema, req.body);
  ok(res, taskService.createTag(req.ctx, body), "Tag created", 201);
};

export const bindTags = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(bindTagsSchema, req.body);
  ok(res, taskService.bindTags(req.ctx, params.id, body), "Tags bound");
};

export const unbindTag = (req: AuthedRequest, res: Response) => {
  const params = parseParams(tagIdParamsSchema, req.params);
  ok(res, taskService.unbindTag(req.ctx, params.id, params.tagId), "Tag unbound");
};

export const listRelations = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.listRelations(req.ctx, params.id));
};

export const createRelation = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(relationSchema, req.body);
  ok(res, taskService.createRelation(req.ctx, params.id, body), "Relation created", 201);
};

export const deleteRelation = (req: AuthedRequest, res: Response) => {
  const params = parseParams(relationIdParamsSchema, req.params);
  ok(res, taskService.deleteRelation(req.ctx, params.id), "Relation deleted");
};

export const listActivities = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, taskService.listActivities(req.ctx, params.id));
};

export const getWorkload = (req: AuthedRequest, res: Response) => {
  const query = parseQuery(workloadQuerySchema, req.query);
  ok(res, taskService.workload(req.ctx, query));
};
