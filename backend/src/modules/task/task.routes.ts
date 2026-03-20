import { Router } from "express";

import { asyncHandler } from "../../common/http";
import {
  bindAttachments,
  bindTags,
  createComment,
  createRelation,
  createSubtask,
  createTag,
  createTask,
  deleteAttachment,
  deleteComment,
  deleteRelation,
  deleteSubtask,
  deleteTask,
  favoriteTask,
  getMustDoToday,
  getRiskTasks,
  getTaskDashboard,
  getTaskDetail,
  getTodoTasks,
  getWorkload,
  listActivities,
  listAttachments,
  listComments,
  listRelations,
  listSubtasks,
  listTags,
  listTasks,
  unfavoriteTask,
  unbindAttachment,
  unbindTag,
  updateComment,
  updateSubtask,
  updateTask,
  updateTaskStatus,
  uploadFile,
} from "./task.controller";

const router = Router();

router.get("/", asyncHandler(listTasks));
router.post("/", asyncHandler(createTask));
router.get("/dashboard", asyncHandler(getTaskDashboard));
router.get("/must-do-today", asyncHandler(getMustDoToday));
router.get("/risk", asyncHandler(getRiskTasks));
router.get("/todo", asyncHandler(getTodoTasks));
router.get("/:id", asyncHandler(getTaskDetail));
router.patch("/:id", asyncHandler(updateTask));
router.delete("/:id", asyncHandler(deleteTask));
router.patch("/:id/status", asyncHandler(updateTaskStatus));
router.post("/:id/favorite", asyncHandler(favoriteTask));
router.delete("/:id/favorite", asyncHandler(unfavoriteTask));
router.get("/:id/subtasks", asyncHandler(listSubtasks));
router.post("/:id/subtasks", asyncHandler(createSubtask));
router.get("/:id/comments", asyncHandler(listComments));
router.post("/:id/comments", asyncHandler(createComment));
router.get("/:id/attachments", asyncHandler(listAttachments));
router.post("/:id/attachments", asyncHandler(bindAttachments));
router.delete("/:id/attachments/:attachmentId", asyncHandler(unbindAttachment));
router.post("/:id/tags", asyncHandler(bindTags));
router.delete("/:id/tags/:tagId", asyncHandler(unbindTag));
router.get("/:id/relations", asyncHandler(listRelations));
router.post("/:id/relations", asyncHandler(createRelation));
router.get("/:id/activities", asyncHandler(listActivities));

export const taskRouter = router;

const subtaskRouter = Router();
subtaskRouter.patch("/:id", asyncHandler(updateSubtask));
subtaskRouter.delete("/:id", asyncHandler(deleteSubtask));
export const subtasksRouter = subtaskRouter;

const commentCrudRouter = Router();
commentCrudRouter.patch("/:id", asyncHandler(updateComment));
commentCrudRouter.delete("/:id", asyncHandler(deleteComment));
export const commentsRouter = commentCrudRouter;

const fileUploadRouter = Router();
fileUploadRouter.post("/upload", asyncHandler(uploadFile));
export const filesRouter = fileUploadRouter;

const attachmentCrudRouter = Router();
attachmentCrudRouter.delete("/:id", asyncHandler(deleteAttachment));
export const attachmentsRouter = attachmentCrudRouter;

const tagCrudRouter = Router();
tagCrudRouter.get("/", asyncHandler(listTags));
tagCrudRouter.post("/", asyncHandler(createTag));
export const tagsRouter = tagCrudRouter;

const relationCrudRouter = Router();
relationCrudRouter.delete("/:id", asyncHandler(deleteRelation));
export const relationsRouter = relationCrudRouter;

const workloadStatsRouter = Router();
workloadStatsRouter.get("/team", asyncHandler(getWorkload));
export const workloadRouter = workloadStatsRouter;
