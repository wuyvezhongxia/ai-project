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
  subtaskUpdateSchema,
  tagIdParamsSchema,
  taskListQuerySchema,
  taskStatusSchema,
  updateTaskSchema,
  uploadFileSchema,
  workloadQuerySchema,
} from "./task.schemas";
import { taskService } from "./task.service";

export const listTasks = async (req: AuthedRequest, res: Response) => {
  const query = parseQuery(taskListQuerySchema, req.query);
  ok(res, await taskService.list(req.ctx, query));
};

export const createTask = async (req: AuthedRequest, res: Response) => {
  const body = parseBody(createTaskSchema, req.body);
  ok(res, await taskService.create(req.ctx, body), "Task created", 201);
};

export const getTaskDetail = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.detail(req.ctx, params.id));
};

export const updateTask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(updateTaskSchema, req.body);
  ok(res, await taskService.update(req.ctx, params.id, body), "Task updated");
};

export const deleteTask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.remove(req.ctx, params.id), "Task deleted");
};

export const updateTaskStatus = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(taskStatusSchema, req.body);
  ok(res, await taskService.updateStatus(req.ctx, params.id, body), "Task status updated");
};

export const favoriteTask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.favorite(req.ctx, params.id), "Task favorited");
};

export const unfavoriteTask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.unfavorite(req.ctx, params.id), "Task unfavorited");
};

export const getTaskDashboard = async (req: AuthedRequest, res: Response) => {
  ok(res, await taskService.dashboard(req.ctx));
};

export const getMustDoToday = async (req: AuthedRequest, res: Response) => {
  ok(res, await taskService.mustDoToday(req.ctx));
};

export const getRiskTasks = async (req: AuthedRequest, res: Response) => {
  ok(res, await taskService.riskList(req.ctx));
};

export const getTodoTasks = async (req: AuthedRequest, res: Response) => {
  const query = parseQuery(taskListQuerySchema, req.query);
  ok(res, await taskService.todo(req.ctx, query));
};

export const listSubtasks = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.listSubtasks(req.ctx, params.id));
};

export const createSubtask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(subtaskSchema, req.body);
  ok(res, await taskService.createSubtask(req.ctx, params.id, body), "Subtask created", 201);
};

export const updateSubtask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(subtaskUpdateSchema, req.body);
  ok(res, await taskService.updateSubtask(req.ctx, params.id, body), "Subtask updated");
};

export const deleteSubtask = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.deleteSubtask(req.ctx, params.id), "Subtask deleted");
};

export const listComments = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.listComments(req.ctx, params.id));
};

export const createComment = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(commentSchema, req.body);
  ok(res, await taskService.createComment(req.ctx, params.id, body), "Comment created", 201);
};

export const updateComment = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(commentSchema, req.body);
  ok(res, await taskService.updateComment(req.ctx, params.id, body), "Comment updated");
};

export const deleteComment = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.deleteComment(req.ctx, params.id), "Comment deleted");
};

export const uploadFile = async (req: AuthedRequest, res: Response) => {
  const body = parseBody(uploadFileSchema, req.body);
  ok(res, await taskService.uploadFile(req.ctx, body), "Attachment uploaded", 201);
};

export const listAttachments = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.listAttachments(req.ctx, params.id));
};

export const bindAttachments = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(bindAttachmentsSchema, req.body);
  ok(res, await taskService.bindAttachments(req.ctx, params.id, body), "Attachments bound", 201);
};

export const unbindAttachment = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(attachmentIdParamsSchema, req.params);
  ok(res, await taskService.unbindAttachment(req.ctx, params.id, params.attachmentId), "Attachment unbound");
};

export const deleteAttachment = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.deleteAttachment(req.ctx, params.id), "Attachment deleted");
};

export const listTags = async (req: AuthedRequest, res: Response) => {
  ok(res, await taskService.listTags(req.ctx));
};

export const createTag = async (req: AuthedRequest, res: Response) => {
  const body = parseBody(createTagSchema, req.body);
  ok(res, await taskService.createTag(req.ctx, body), "Tag created", 201);
};

export const bindTags = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(bindTagsSchema, req.body);
  ok(res, await taskService.bindTags(req.ctx, params.id, body), "Tags bound");
};

export const unbindTag = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(tagIdParamsSchema, req.params);
  ok(res, await taskService.unbindTag(req.ctx, params.id, params.tagId), "Tag unbound");
};

export const listRelations = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.listRelations(req.ctx, params.id));
};

export const createRelation = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(relationSchema, req.body);
  ok(res, await taskService.createRelation(req.ctx, params.id, body), "Relation created", 201);
};

export const deleteRelation = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(relationIdParamsSchema, req.params);
  ok(res, await taskService.deleteRelation(req.ctx, params.id), "Relation deleted");
};

export const listActivities = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await taskService.listActivities(req.ctx, params.id));
};

export const getWorkload = async (req: AuthedRequest, res: Response) => {
  const query = parseQuery(workloadQuerySchema, req.query);
  ok(res, await taskService.workload(req.ctx, query));
};
