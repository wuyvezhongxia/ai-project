import { z } from "zod";

import { db } from "../../common/data-store";
import { AppError } from "../../common/http";
import type { Attachment, AuthContext, Project, Subtask, Tag, Task, TaskComment } from "../../common/types";
import {
  bindAttachmentsSchema,
  bindTagsSchema,
  commentSchema,
  createTagSchema,
  createTaskSchema,
  relationSchema,
  subtaskSchema,
  taskListQuerySchema,
  taskStatusSchema,
  updateTaskSchema,
  uploadFileSchema,
  workloadQuerySchema,
} from "./task.schemas";

type TaskListQuery = z.infer<typeof taskListQuerySchema>;
type CreateTaskInput = z.infer<typeof createTaskSchema>;
type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
type StatusInput = z.infer<typeof taskStatusSchema>;
type SubtaskInput = z.infer<typeof subtaskSchema>;
type CommentInput = z.infer<typeof commentSchema>;
type UploadFileInput = z.infer<typeof uploadFileSchema>;
type BindAttachmentsInput = z.infer<typeof bindAttachmentsSchema>;
type CreateTagInput = z.infer<typeof createTagSchema>;
type BindTagsInput = z.infer<typeof bindTagsSchema>;
type RelationInput = z.infer<typeof relationSchema>;
type WorkloadQuery = z.infer<typeof workloadQuerySchema>;

const now = () => new Date().toISOString();

const isManager = (ctx: AuthContext) => ctx.roleIds.includes(1);

const getProject = (tenantId: string, projectId?: number) => {
  if (!projectId) {
    return null;
  }

  const project = db.projects.find((item) => item.id === projectId && item.tenantId === tenantId && item.delFlag === "0");
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  return project;
};

const ensureProjectMember = (ctx: AuthContext, project: Project | null) => {
  if (!project) {
    return;
  }

  const isMember = db.projectMembers.some(
    (item) =>
      item.tenantId === ctx.tenantId &&
      item.projectId === project.id &&
      item.userId === ctx.userId &&
      item.delFlag === "0",
  );

  if (project.ownerUserId === ctx.userId || isManager(ctx) || isMember) {
    return;
  }

  throw new AppError("No permission to access project task", 403);
};

const getActiveUser = (tenantId: string, userId?: number) => {
  if (!userId) {
    return null;
  }

  const user = db.users.find(
    (item) => item.userId === userId && item.tenantId === tenantId && item.status === "0" && item.delFlag === "0",
  );
  if (!user) {
    throw new AppError(`User ${userId} not found or disabled`, 400);
  }

  return user;
};

const getTaskOrThrow = (tenantId: string, id: number) => {
  const task = db.tasks.find((item) => item.id === id && item.tenantId === tenantId && item.delFlag === "0");
  if (!task) {
    throw new AppError("Task not found", 404);
  }

  return task;
};

const ensureTaskEditor = (ctx: AuthContext, task: Task) => {
  const project = getProject(ctx.tenantId, task.projectId);
  const isCollaborator = db.taskCollaborators.some(
    (item) => item.taskId === task.id && item.userId === ctx.userId && item.tenantId === ctx.tenantId && item.delFlag === "0",
  );

  if (
    isManager(ctx) ||
    task.assigneeUserId === ctx.userId ||
    task.createBy === ctx.userId ||
    isCollaborator ||
    project?.ownerUserId === ctx.userId
  ) {
    return;
  }

  throw new AppError("No permission to modify task", 403);
};

const ensureTaskCommentPermission = (ctx: AuthContext, task: Task) => {
  const project = getProject(ctx.tenantId, task.projectId);
  ensureProjectMember(ctx, project);
};

const recalcProjectProgress = (tenantId: string, projectId?: number) => {
  if (!projectId) {
    return;
  }

  const project = db.projects.find((item) => item.id === projectId && item.tenantId === tenantId && item.delFlag === "0");
  if (!project) {
    return;
  }

  const tasks = db.tasks.filter((item) => item.projectId === projectId && item.tenantId === tenantId && item.delFlag === "0");
  const progress = tasks.length === 0 ? 0 : tasks.reduce((sum, item) => sum + item.progress, 0) / tasks.length;
  project.progress = Number(progress.toFixed(2));
  project.updateTime = now();
};

const refreshTaskDerivedFields = (task: Task) => {
  if (task.status === "3" || task.progress === 100) {
    task.status = "3";
    task.progress = 100;
    task.finishTime = task.finishTime ?? now();
  } else {
    task.finishTime = undefined;
  }

  if (!task.dueTime || task.status === "3") {
    task.riskLevel = "0";
    return;
  }

  const dueAt = new Date(task.dueTime).getTime();
  const diff = dueAt - Date.now();
  if (diff < 0) {
    task.status = "4";
    task.riskLevel = "3";
  } else if (diff <= 24 * 60 * 60 * 1000 && task.progress < 80) {
    task.riskLevel = "2";
  } else if (diff <= 48 * 60 * 60 * 1000 && task.progress < 60) {
    task.riskLevel = "1";
  } else {
    task.riskLevel = "0";
  }
};

const logTaskActivity = (ctx: AuthContext, taskId: number, actionType: string, actionContent?: string, extraJson?: Record<string, unknown>) => {
  db.taskActivities.push({
    id: db.nextId("taskActivity"),
    tenantId: ctx.tenantId,
    taskId,
    actionType,
    actionUserId: ctx.userId,
    actionContent,
    extraJson,
    createTime: now(),
  });
};

const decorateTask = (ctx: AuthContext, task: Task) => {
  const collaborators = db.taskCollaborators
    .filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId && item.delFlag === "0")
    .map((item) => db.users.find((user) => user.userId === item.userId))
    .filter(Boolean);

  const tags = db.taskTagRels
    .filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId)
    .map((item) => db.tags.find((tag) => tag.id === item.tagId && tag.delFlag === "0"))
    .filter(Boolean);

  const attachmentIds = db.taskAttachmentRels
    .filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId)
    .map((item) => item.attachmentId);
  const attachments = db.attachments.filter(
    (item) => attachmentIds.includes(item.id) && item.tenantId === ctx.tenantId && item.delFlag === "0",
  );

  const subtasks = db.subtasks.filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId && item.delFlag === "0");
  const comments = db.comments.filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId && item.delFlag === "0");

  return {
    ...task,
    project: task.projectId ? getProject(ctx.tenantId, task.projectId) : null,
    assignee: task.assigneeUserId ? db.users.find((user) => user.userId === task.assigneeUserId) : null,
    collaborators,
    tags,
    attachments,
    isFavorite: db.taskFavorites.some(
      (item) => item.taskId === task.id && item.userId === ctx.userId && item.tenantId === ctx.tenantId,
    ),
    subtaskSummary: {
      total: subtasks.length,
      completed: subtasks.filter((item) => item.status === "1").length,
    },
    commentCount: comments.length,
  };
};

type DecoratedTask = ReturnType<typeof decorateTask>;

const ensureTag = (tenantId: string, tagId: number) => {
  const tag = db.tags.find((item) => item.id === tagId && item.tenantId === tenantId && item.delFlag === "0");
  if (!tag) {
    throw new AppError(`Tag ${tagId} not found`, 404);
  }

  return tag;
};

const ensureAttachment = (tenantId: string, attachmentId: number) => {
  const attachment = db.attachments.find(
    (item) => item.id === attachmentId && item.tenantId === tenantId && item.delFlag === "0",
  );
  if (!attachment) {
    throw new AppError(`Attachment ${attachmentId} not found`, 404);
  }

  return attachment;
};

export const taskService = {
  list(ctx: AuthContext, query: TaskListQuery) {
    const favorites = new Set(
      db.taskFavorites
        .filter((item) => item.tenantId === ctx.tenantId && item.userId === ctx.userId)
        .map((item) => item.taskId),
    );
    const collaboratorTaskIds = new Set(
      db.taskCollaborators
        .filter((item) => item.tenantId === ctx.tenantId && item.userId === ctx.userId && item.delFlag === "0")
        .map((item) => item.taskId),
    );

    const filtered = db.tasks
      .filter((task) => {
        if (task.tenantId !== ctx.tenantId || task.delFlag !== "0") {
          return false;
        }

        if (query.projectId && task.projectId !== query.projectId) {
          return false;
        }

        if (query.scope === "owned" && task.assigneeUserId !== ctx.userId) {
          return false;
        }

        if (query.scope === "created" && task.createBy !== ctx.userId) {
          return false;
        }

        if (query.scope === "collaborated" && !collaboratorTaskIds.has(task.id)) {
          return false;
        }

        if (query.status && task.status !== query.status) {
          return false;
        }

        if (query.priority && task.priority !== query.priority) {
          return false;
        }

        if (query.assigneeUserId && task.assigneeUserId !== query.assigneeUserId) {
          return false;
        }

        if (query.creatorUserId && task.createBy !== query.creatorUserId) {
          return false;
        }

        if (query.favorite === "true" && !favorites.has(task.id)) {
          return false;
        }

        if (query.riskLevel && task.riskLevel !== query.riskLevel) {
          return false;
        }

        if (query.keyword && !task.taskName.includes(query.keyword)) {
          return false;
        }

        if (query.tagId) {
          const hasTag = db.taskTagRels.some((item) => item.taskId === task.id && item.tagId === query.tagId);
          if (!hasTag) {
            return false;
          }
        }

        if (query.dueRange && task.dueTime) {
          const due = new Date(task.dueTime);
          const today = new Date();
          if (query.dueRange === "today" && due.toDateString() !== today.toDateString()) {
            return false;
          }
          if (query.dueRange === "overdue" && due >= today) {
            return false;
          }
          if (query.dueRange === "week") {
            const end = new Date();
            end.setDate(end.getDate() + 7);
            if (due < today || due > end) {
              return false;
            }
          }
        }

        return true;
      })
      .map((task) => decorateTask(ctx, task));

    if (query.view === "kanban") {
      return {
        notStarted: filtered.filter((item) => item.status === "0"),
        inProgress: filtered.filter((item) => item.status === "1"),
        review: filtered.filter((item) => item.status === "2"),
        completed: filtered.filter((item) => item.status === "3"),
        delayed: filtered.filter((item) => item.status === "4"),
      };
    }

    return filtered;
  },

  create(ctx: AuthContext, input: CreateTaskInput) {
    const project = getProject(ctx.tenantId, input.projectId);
    ensureProjectMember(ctx, project);
    const assignee = getActiveUser(ctx.tenantId, input.assigneeUserId);

    const task: Task = {
      id: db.nextId("task"),
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      taskNo: `TASK-${Date.now()}`,
      taskName: input.taskName,
      taskDesc: input.taskDesc,
      assigneeUserId: input.assigneeUserId,
      assigneeDeptId: assignee?.deptId,
      creatorUserId: ctx.userId,
      sourceType: input.sourceType ?? "manual",
      taskType: input.taskType ?? "task",
      status: input.progress === 100 ? "3" : "0",
      priority: input.priority ?? "1",
      progress: input.progress ?? 0,
      startTime: input.startTime,
      dueTime: input.dueTime,
      estimatedHours: input.estimatedHours,
      actualHours: input.actualHours,
      parentTaskId: input.parentTaskId,
      sortNo: input.sortNo,
      createDept: ctx.deptId,
      createBy: ctx.userId,
      createTime: now(),
      delFlag: "0",
    };

    refreshTaskDerivedFields(task);
    db.tasks.push(task);

    input.collaboratorUserIds.forEach((userId) => {
      const user = getActiveUser(ctx.tenantId, userId);
      db.taskCollaborators.push({
        id: db.nextId("taskCollaborator"),
        tenantId: ctx.tenantId,
        taskId: task.id,
        userId,
        deptId: user?.deptId,
        createBy: ctx.userId,
        createTime: now(),
        delFlag: "0",
      });
    });

    input.tagIds.forEach((tagId) => {
      ensureTag(ctx.tenantId, tagId);
      db.taskTagRels.push({
        id: db.nextId("taskTagRel"),
        tenantId: ctx.tenantId,
        taskId: task.id,
        tagId,
        createBy: ctx.userId,
        createTime: now(),
      });
    });

    input.attachmentIds.forEach((attachmentId) => {
      ensureAttachment(ctx.tenantId, attachmentId);
      db.taskAttachmentRels.push({
        id: db.nextId("taskAttachmentRel"),
        tenantId: ctx.tenantId,
        taskId: task.id,
        attachmentId,
        createBy: ctx.userId,
        createTime: now(),
      });
    });

    logTaskActivity(ctx, task.id, "create", `Created task ${task.taskName}`);
    recalcProjectProgress(ctx.tenantId, task.projectId);
    return decorateTask(ctx, task);
  },

  detail(ctx: AuthContext, id: number) {
    const task = getTaskOrThrow(ctx.tenantId, id);
    const project = getProject(ctx.tenantId, task.projectId);
    ensureProjectMember(ctx, project);

    return {
      ...decorateTask(ctx, task),
      comments: this.listComments(ctx, id),
      subtasks: this.listSubtasks(ctx, id),
      activities: this.listActivities(ctx, id),
      relations: this.listRelations(ctx, id),
    };
  },

  update(ctx: AuthContext, id: number, input: UpdateTaskInput) {
    const task = getTaskOrThrow(ctx.tenantId, id);
    ensureTaskEditor(ctx, task);

    if (input.projectId !== undefined) {
      const project = getProject(ctx.tenantId, input.projectId);
      ensureProjectMember(ctx, project);
      task.projectId = input.projectId;
    }

    if (input.assigneeUserId !== undefined) {
      const assignee = getActiveUser(ctx.tenantId, input.assigneeUserId);
      task.assigneeUserId = input.assigneeUserId;
      task.assigneeDeptId = assignee?.deptId;
    }

    Object.assign(task, {
      taskName: input.taskName ?? task.taskName,
      taskDesc: input.taskDesc ?? task.taskDesc,
      sourceType: input.sourceType ?? task.sourceType,
      taskType: input.taskType ?? task.taskType,
      priority: input.priority ?? task.priority,
      progress: input.progress ?? task.progress,
      startTime: input.startTime ?? task.startTime,
      dueTime: input.dueTime ?? task.dueTime,
      estimatedHours: input.estimatedHours ?? task.estimatedHours,
      actualHours: input.actualHours ?? task.actualHours,
      parentTaskId: input.parentTaskId ?? task.parentTaskId,
      sortNo: input.sortNo ?? task.sortNo,
      status: input.status ?? task.status,
      riskLevel: input.riskLevel ?? task.riskLevel,
      updateBy: ctx.userId,
      updateTime: now(),
    });

    if (input.collaboratorUserIds) {
      db.taskCollaborators
        .filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId && item.delFlag === "0")
        .forEach((item) => {
          item.delFlag = "1";
        });

      input.collaboratorUserIds.forEach((userId) => {
        const user = getActiveUser(ctx.tenantId, userId);
        db.taskCollaborators.push({
          id: db.nextId("taskCollaborator"),
          tenantId: ctx.tenantId,
          taskId: task.id,
          userId,
          deptId: user?.deptId,
          createBy: ctx.userId,
          createTime: now(),
          delFlag: "0",
        });
      });
    }

    if (input.tagIds) {
      db.taskTagRels
        .filter((item) => item.taskId === task.id && item.tenantId === ctx.tenantId)
        .forEach((item) => {
          const index = db.taskTagRels.indexOf(item);
          db.taskTagRels.splice(index, 1);
        });

      input.tagIds.forEach((tagId) => {
        ensureTag(ctx.tenantId, tagId);
        db.taskTagRels.push({
          id: db.nextId("taskTagRel"),
          tenantId: ctx.tenantId,
          taskId: task.id,
          tagId,
          createBy: ctx.userId,
          createTime: now(),
        });
      });
    }

    refreshTaskDerivedFields(task);
    logTaskActivity(ctx, task.id, "update", `Updated task ${task.taskName}`);
    recalcProjectProgress(ctx.tenantId, task.projectId);
    return decorateTask(ctx, task);
  },

  remove(ctx: AuthContext, id: number) {
    const task = getTaskOrThrow(ctx.tenantId, id);
    ensureTaskEditor(ctx, task);
    task.delFlag = "1";
    task.updateBy = ctx.userId;
    task.updateTime = now();
    logTaskActivity(ctx, task.id, "delete", `Deleted task ${task.taskName}`);
    recalcProjectProgress(ctx.tenantId, task.projectId);
    return { success: true };
  },

  updateStatus(ctx: AuthContext, id: number, input: StatusInput) {
    return this.update(ctx, id, { status: input.status });
  },

  favorite(ctx: AuthContext, id: number) {
    const task = getTaskOrThrow(ctx.tenantId, id);
    ensureTaskCommentPermission(ctx, task);
    const exists = db.taskFavorites.find((item) => item.tenantId === ctx.tenantId && item.taskId === id && item.userId === ctx.userId);
    if (!exists) {
      db.taskFavorites.push({
        id: db.nextId("taskFavorite"),
        tenantId: ctx.tenantId,
        taskId: id,
        userId: ctx.userId,
        createTime: now(),
      });
    }

    return { success: true };
  },

  unfavorite(ctx: AuthContext, id: number) {
    const index = db.taskFavorites.findIndex(
      (item) => item.tenantId === ctx.tenantId && item.taskId === id && item.userId === ctx.userId,
    );
    if (index >= 0) {
      db.taskFavorites.splice(index, 1);
    }

    return { success: true };
  },

  dashboard(ctx: AuthContext) {
    const all = this.list(ctx, { view: "list" }) as DecoratedTask[];
    const today = this.mustDoToday(ctx);
    const owned = this.list(ctx, { scope: "owned", view: "list" }) as DecoratedTask[];
    const created = this.list(ctx, { scope: "created", view: "list" }) as DecoratedTask[];
    const favorite = this.list(ctx, { favorite: "true", view: "list" }) as DecoratedTask[];
    const risk = this.riskList(ctx);

    return {
      today,
      owned,
      created,
      favorite,
      risk,
      summary: {
        total: all.length,
        owned: owned.length,
        today: today.length,
        risk: risk.length,
      },
    };
  },

  mustDoToday(ctx: AuthContext) {
    return (this.list(ctx, { scope: "owned", view: "list" }) as DecoratedTask[]).filter((item) => {
      if (!item.dueTime) {
        return false;
      }

      const dueDate = new Date(item.dueTime).toDateString();
      const today = new Date().toDateString();
      return dueDate === today || new Date(item.dueTime) < new Date();
    });
  },

  riskList(ctx: AuthContext) {
    return (this.list(ctx, { view: "list" }) as DecoratedTask[]).filter((item) => ["2", "3"].includes(item.riskLevel ?? ""));
  },

  todo(ctx: AuthContext, query: TaskListQuery) {
    return this.list(ctx, query);
  },

  listSubtasks(ctx: AuthContext, taskId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    return db.subtasks.filter((item) => item.taskId === taskId && item.tenantId === ctx.tenantId && item.delFlag === "0");
  },

  createSubtask(ctx: AuthContext, taskId: number, input: SubtaskInput) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);
    const subtask: Subtask = {
      id: db.nextId("subtask"),
      tenantId: ctx.tenantId,
      taskId,
      subtaskName: input.subtaskName,
      status: input.status ?? "0",
      sortNo: input.sortNo,
      createBy: ctx.userId,
      createTime: now(),
      delFlag: "0",
    };
    db.subtasks.push(subtask);
    logTaskActivity(ctx, taskId, "add_subtask", `Added subtask ${subtask.subtaskName}`);
    return this.listSubtasks(ctx, taskId);
  },

  updateSubtask(ctx: AuthContext, id: number, input: Partial<SubtaskInput>) {
    const subtask = db.subtasks.find((item) => item.id === id && item.tenantId === ctx.tenantId && item.delFlag === "0");
    if (!subtask) {
      throw new AppError("Subtask not found", 404);
    }

    const task = getTaskOrThrow(ctx.tenantId, subtask.taskId);
    ensureTaskEditor(ctx, task);
    subtask.subtaskName = input.subtaskName ?? subtask.subtaskName;
    subtask.status = input.status ?? subtask.status;
    subtask.sortNo = input.sortNo ?? subtask.sortNo;
    subtask.updateBy = ctx.userId;
    subtask.updateTime = now();
    logTaskActivity(ctx, subtask.taskId, "update_subtask", `Updated subtask ${subtask.subtaskName}`);
    return subtask;
  },

  deleteSubtask(ctx: AuthContext, id: number) {
    const subtask = db.subtasks.find((item) => item.id === id && item.tenantId === ctx.tenantId && item.delFlag === "0");
    if (!subtask) {
      throw new AppError("Subtask not found", 404);
    }

    const task = getTaskOrThrow(ctx.tenantId, subtask.taskId);
    ensureTaskEditor(ctx, task);
    subtask.delFlag = "1";
    logTaskActivity(ctx, subtask.taskId, "delete_subtask", `Deleted subtask ${subtask.subtaskName}`);
    return { success: true };
  },

  listComments(ctx: AuthContext, taskId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    return db.comments
      .filter((item) => item.taskId === taskId && item.tenantId === ctx.tenantId && item.delFlag === "0")
      .map((item) => ({
        ...item,
        user: db.users.find((user) => user.userId === item.commentUserId),
      }));
  },

  createComment(ctx: AuthContext, taskId: number, input: CommentInput) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    const comment: TaskComment = {
      id: db.nextId("taskComment"),
      tenantId: ctx.tenantId,
      taskId,
      commentUserId: ctx.userId,
      content: input.content,
      parentCommentId: input.parentCommentId,
      createTime: now(),
      delFlag: "0",
    };
    db.comments.push(comment);
    logTaskActivity(ctx, taskId, "comment", "Added comment");
    return comment;
  },

  updateComment(ctx: AuthContext, id: number, input: CommentInput) {
    const comment = db.comments.find((item) => item.id === id && item.tenantId === ctx.tenantId && item.delFlag === "0");
    if (!comment) {
      throw new AppError("Comment not found", 404);
    }

    if (comment.commentUserId !== ctx.userId && !isManager(ctx)) {
      throw new AppError("No permission to edit comment", 403);
    }

    comment.content = input.content;
    return comment;
  },

  deleteComment(ctx: AuthContext, id: number) {
    const comment = db.comments.find((item) => item.id === id && item.tenantId === ctx.tenantId && item.delFlag === "0");
    if (!comment) {
      throw new AppError("Comment not found", 404);
    }

    if (comment.commentUserId !== ctx.userId && !isManager(ctx)) {
      throw new AppError("No permission to delete comment", 403);
    }

    comment.delFlag = "1";
    return { success: true };
  },

  uploadFile(ctx: AuthContext, input: UploadFileInput) {
    const attachment: Attachment = {
      id: db.nextId("attachment"),
      tenantId: ctx.tenantId,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize,
      fileType: input.fileType,
      storageType: input.storageType ?? "OSS",
      uploadUserId: ctx.userId,
      createTime: now(),
      delFlag: "0",
    };
    db.attachments.push(attachment);
    return attachment;
  },

  listAttachments(ctx: AuthContext, taskId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    const ids = db.taskAttachmentRels
      .filter((item) => item.taskId === taskId && item.tenantId === ctx.tenantId)
      .map((item) => item.attachmentId);

    return db.attachments.filter((item) => ids.includes(item.id) && item.tenantId === ctx.tenantId && item.delFlag === "0");
  },

  bindAttachments(ctx: AuthContext, taskId: number, input: BindAttachmentsInput) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);
    input.attachmentIds.forEach((attachmentId) => {
      ensureAttachment(ctx.tenantId, attachmentId);
      const exists = db.taskAttachmentRels.some(
        (item) => item.tenantId === ctx.tenantId && item.taskId === taskId && item.attachmentId === attachmentId,
      );
      if (!exists) {
        db.taskAttachmentRels.push({
          id: db.nextId("taskAttachmentRel"),
          tenantId: ctx.tenantId,
          taskId,
          attachmentId,
          createBy: ctx.userId,
          createTime: now(),
        });
      }
    });

    return this.listAttachments(ctx, taskId);
  },

  unbindAttachment(ctx: AuthContext, taskId: number, attachmentId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);
    const index = db.taskAttachmentRels.findIndex(
      (item) => item.tenantId === ctx.tenantId && item.taskId === taskId && item.attachmentId === attachmentId,
    );
    if (index >= 0) {
      db.taskAttachmentRels.splice(index, 1);
    }
    return { success: true };
  },

  deleteAttachment(ctx: AuthContext, attachmentId: number) {
    const attachment = ensureAttachment(ctx.tenantId, attachmentId);
    if (attachment.uploadUserId !== ctx.userId && !isManager(ctx)) {
      throw new AppError("No permission to delete attachment", 403);
    }

    attachment.delFlag = "1";
    return { success: true };
  },

  listTags(ctx: AuthContext) {
    return db.tags.filter((item) => item.tenantId === ctx.tenantId && item.delFlag === "0");
  },

  createTag(ctx: AuthContext, input: CreateTagInput) {
    const tag: Tag = {
      id: db.nextId("tag"),
      tenantId: ctx.tenantId,
      tagName: input.tagName,
      tagColor: input.tagColor,
      tagType: input.tagType ?? "task",
      createBy: ctx.userId,
      createTime: now(),
      delFlag: "0",
    };
    db.tags.push(tag);
    return tag;
  },

  bindTags(ctx: AuthContext, taskId: number, input: BindTagsInput) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);

    input.tagIds.forEach((tagId) => {
      ensureTag(ctx.tenantId, tagId);
      const exists = db.taskTagRels.some((item) => item.tenantId === ctx.tenantId && item.taskId === taskId && item.tagId === tagId);
      if (!exists) {
        db.taskTagRels.push({
          id: db.nextId("taskTagRel"),
          tenantId: ctx.tenantId,
          taskId,
          tagId,
          createBy: ctx.userId,
          createTime: now(),
        });
      }
    });

    return decorateTask(ctx, task).tags;
  },

  unbindTag(ctx: AuthContext, taskId: number, tagId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);
    const index = db.taskTagRels.findIndex(
      (item) => item.tenantId === ctx.tenantId && item.taskId === taskId && item.tagId === tagId,
    );
    if (index >= 0) {
      db.taskTagRels.splice(index, 1);
    }
    return { success: true };
  },

  listRelations(ctx: AuthContext, taskId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    return db.taskRelations.filter((item) => item.taskId === taskId && item.tenantId === ctx.tenantId && item.delFlag === "0");
  },

  createRelation(ctx: AuthContext, taskId: number, input: RelationInput) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskEditor(ctx, task);
    const relation = {
      id: db.nextId("taskRelation"),
      tenantId: ctx.tenantId,
      taskId,
      relationType: input.relationType,
      targetId: input.targetId,
      targetTitle: input.targetTitle,
      targetUrl: input.targetUrl,
      createBy: ctx.userId,
      createTime: now(),
      delFlag: "0" as const,
    };
    db.taskRelations.push(relation);
    logTaskActivity(ctx, taskId, "add_relation", `Added relation ${input.targetTitle}`);
    return relation;
  },

  deleteRelation(ctx: AuthContext, relationId: number) {
    const relation = db.taskRelations.find((item) => item.id === relationId && item.tenantId === ctx.tenantId && item.delFlag === "0");
    if (!relation) {
      throw new AppError("Relation not found", 404);
    }

    const task = getTaskOrThrow(ctx.tenantId, relation.taskId);
    ensureTaskEditor(ctx, task);
    relation.delFlag = "1";
    return { success: true };
  },

  listActivities(ctx: AuthContext, taskId: number) {
    const task = getTaskOrThrow(ctx.tenantId, taskId);
    ensureTaskCommentPermission(ctx, task);
    return db.taskActivities
      .filter((item) => item.taskId === taskId && item.tenantId === ctx.tenantId)
      .map((item) => ({
        ...item,
        user: db.users.find((user) => user.userId === item.actionUserId),
      }));
  },

  workload(ctx: AuthContext, query: WorkloadQuery) {
    const days = query.range === "month" ? 30 : 7;
    const end = Date.now() + days * 24 * 60 * 60 * 1000;

    return db.users
      .filter((item) => item.tenantId === ctx.tenantId && item.delFlag === "0" && item.status === "0")
      .map((user) => {
        const tasks = db.tasks.filter(
          (task) =>
            task.tenantId === ctx.tenantId &&
            task.delFlag === "0" &&
            task.assigneeUserId === user.userId &&
            task.status !== "3" &&
            (!task.dueTime || new Date(task.dueTime).getTime() <= end),
        );
        const urgent = tasks.filter((task) => ["2", "3"].includes(task.riskLevel ?? "0")).length;
        return {
          userId: user.userId,
          nickName: user.nickName,
          taskCount: tasks.length,
          urgentCount: urgent,
          loadPercent: Math.min(100, tasks.length * 20 + urgent * 10),
        };
      });
  },
};
