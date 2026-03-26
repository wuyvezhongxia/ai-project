import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  toAttachment,
  toProject,
  toSubtask,
  toTag,
  toTask,
  toTaskActivity,
  toTaskComment,
  toUserProfile,
} from "../../common/db-mappers";
import { fromDbDecimal, fromDbId, toDbId } from "../../common/db-values";
import { AppError } from "../../common/http";
import { prisma } from "../../common/prisma";
import type { Attachment, AuthContext, Tag, Task } from "../../common/types";
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
type BindTagsInput = z.infer<typeof bindTagsSchema>;
type CreateTagInput = z.infer<typeof createTagSchema>;
type RelationInput = z.infer<typeof relationSchema>;
type WorkloadQuery = z.infer<typeof workloadQuerySchema>;

const DEFAULT_PRIORITY = "1";
const DEFAULT_STATUS = "0";

const statusKanbanMap: Record<string, string> = {
  "0": "notStarted",
  "1": "inProgress",
  "2": "completed",
  "3": "delayed",
};

const isManager = (ctx: AuthContext) => ctx.roleIds.includes("1");

const normalizeCollaboratorUserIds = (userIds: string[], excludedUserIds: Array<string | undefined>) => {
  const excluded = new Set(excludedUserIds.filter((value): value is string => Boolean(value)));
  return [...new Set(userIds)].filter((userId) => !excluded.has(userId));
};

const isDelayedTask = (task: Pick<Task, "status" | "dueTime">) => {
  if (task.status === "3") return true;
  if (task.status === "2" || !task.dueTime) return false;

  const due = new Date(task.dueTime);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
};

const isRiskTask = (task: Pick<Task, "status" | "dueTime" | "riskLevel">) => {
  if (task.status === "2" || isDelayedTask(task)) return false;

  const dueSoon =
    task.dueTime != null &&
    (() => {
      const due = new Date(task.dueTime);
      if (Number.isNaN(due.getTime())) return false;
      const diff = due.getTime() - Date.now();
      return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
    })();

  return ["2", "3"].includes(task.riskLevel ?? "0") || dueSoon;
};

const buildDueCategory = (task: Task) => {
  if (task.status === "2") return "completed";
  if (!task.dueTime) return "week";

  const due = new Date(task.dueTime);
  if (Number.isNaN(due.getTime())) return "week";

  const now = Date.now();
  if (due.getTime() < now) return "overdue";
  if (due.getTime() - now <= 24 * 60 * 60 * 1000) return "today";

  return "week";
};

const buildDueText = (task: Task) => {
  if (task.status === "2") return "——";
  if (!task.dueTime) return "未设置";

  const due = new Date(task.dueTime);
  if (Number.isNaN(due.getTime())) return task.dueTime;

  const diff = due.getTime() - Date.now();
  if (diff < 0) {
    return `已超期 ${Math.max(1, Math.ceil(Math.abs(diff) / (24 * 60 * 60 * 1000)))} 天`;
  }

  if (diff <= 24 * 60 * 60 * 1000) {
    return `今天 ${due.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }

  return due.toISOString().slice(0, 10);
};

async function getActiveUser(ctx: AuthContext, userId?: string) {
  if (!userId) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: toDbId(userId),
      delFlag: "0",
      status: "0",
    },
  });

  return user ? toUserProfile(user) : null;
}

async function getProject(ctx: AuthContext, projectId?: string) {
  if (!projectId) {
    return null;
  }

  const project = await prisma.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      id: toDbId(projectId),
      delFlag: "0",
    },
  });

  return project ? toProject(project) : null;
}

async function ensureProjectAccess(ctx: AuthContext, projectId?: string) {
  if (!projectId || isManager(ctx)) {
    return;
  }

  const member = await prisma.projectMember.findFirst({
    where: {
      tenantId: ctx.tenantId,
      projectId: toDbId(projectId),
      userId: toDbId(ctx.userId),
      delFlag: "0",
    },
  });

  if (!member) {
    throw new AppError("No permission to access this project", 403);
  }
}

async function getTaskOrThrow(ctx: AuthContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: {
      tenantId: ctx.tenantId,
      id: toDbId(taskId),
      delFlag: "0",
    },
  });

  if (!task) {
    throw new AppError("Task not found", 404);
  }

  if (task.projectId) {
    await ensureProjectAccess(ctx, String(task.projectId));
    return task;
  }

  if (isManager(ctx)) {
    return task;
  }

  const currentUserId = toDbId(ctx.userId);
  if (task.assigneeUserId === currentUserId || task.creatorUserId === currentUserId || task.createBy === currentUserId) {
    return task;
  }

  const collaborator = await prisma.taskCollaborator.findFirst({
    where: {
      tenantId: ctx.tenantId,
      taskId: task.id,
      userId: currentUserId,
      delFlag: "0",
    },
  });

  if (!collaborator) {
    throw new AppError("No permission to access this task", 403);
  }

  return task;
}

async function ensureAttachmentExists(ctx: AuthContext, attachmentId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      id: toDbId(attachmentId),
      delFlag: "0",
    },
  });

  if (!attachment) {
    throw new AppError("Attachment not found", 404);
  }

  return attachment;
}

async function ensureTagExists(ctx: AuthContext, tagId: string) {
  const tag = await prisma.tag.findFirst({
    where: {
      tenantId: ctx.tenantId,
      id: toDbId(tagId),
      delFlag: "0",
    },
  });

  if (!tag) {
    throw new AppError("Tag not found", 404);
  }

  return tag;
}

async function logTaskActivity(
  ctx: AuthContext,
  taskId: string,
  actionType: string,
  actionContent?: string,
  extraJson?: Record<string, unknown>,
) {
  await prisma.taskActivity.create({
    data: {
      tenantId: ctx.tenantId,
      taskId: toDbId(taskId),
      actionType,
      actionUserId: toDbId(ctx.userId),
      actionContent,
      extraJson: extraJson as Prisma.InputJsonValue | undefined,
      createTime: new Date(),
    },
  });
}

async function refreshProjectProgress(ctx: AuthContext, projectId?: string) {
  if (!projectId) {
    return;
  }

  const rows = await prisma.task.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId: toDbId(projectId),
      delFlag: "0",
    },
    select: {
      progress: true,
    },
  });

  const value =
    rows.length === 0
      ? 0
      : Number((rows.reduce((sum, row) => sum + (fromDbDecimal(row.progress) ?? 0), 0) / rows.length).toFixed(2));

  await prisma.project.update({
    where: { id: toDbId(projectId) },
    data: {
      progress: new Prisma.Decimal(value),
      updateTime: new Date(),
    },
  });
}

async function buildTaskView(ctx: AuthContext, task: Task) {
  const [project, assignee, creator, collaboratorRows, subtaskRows, commentRows, activityRows, relationRows, attachmentRelRows, tagRelRows] =
    await Promise.all([
      getProject(ctx, task.projectId),
      getActiveUser(ctx, task.assigneeUserId),
      getActiveUser(ctx, task.creatorUserId),
      prisma.taskCollaborator.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id), delFlag: "0" },
        orderBy: { createTime: "asc" },
      }),
      prisma.subtask.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id), delFlag: "0" },
        orderBy: [{ sortNo: "asc" }, { createTime: "asc" }],
      }),
      prisma.taskComment.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id), delFlag: "0" },
        orderBy: { createTime: "desc" },
      }),
      prisma.taskActivity.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id) },
        orderBy: { createTime: "desc" },
      }),
      prisma.taskRelation.findMany({
        where: { tenantId: ctx.tenantId, fromTaskId: toDbId(task.id) },
        orderBy: { createTime: "desc" },
      }),
      prisma.taskAttachmentRel.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id) },
        orderBy: { createTime: "asc" },
      }),
      prisma.taskTagRel.findMany({
        where: { tenantId: ctx.tenantId, taskId: toDbId(task.id) },
        orderBy: { createTime: "asc" },
      }),
    ]);

  const collaborators = (await Promise.all(collaboratorRows.map((row) => getActiveUser(ctx, String(row.userId))))).filter(Boolean);

  const commentUsers = new Map<string, Awaited<ReturnType<typeof getActiveUser>>>();
  for (const row of commentRows) {
    const key = String(row.commentUserId);
    if (!commentUsers.has(key)) {
      commentUsers.set(key, await getActiveUser(ctx, key));
    }
  }

  const activityUsers = new Map<string, Awaited<ReturnType<typeof getActiveUser>>>();
  for (const row of activityRows) {
    const key = String(row.actionUserId);
    if (!activityUsers.has(key)) {
      activityUsers.set(key, await getActiveUser(ctx, key));
    }
  }

  const relationTargetIds = relationRows.map((row) => row.toTaskId).filter((value): value is bigint => value != null);
  const relationTargets =
    relationTargetIds.length > 0
      ? await prisma.task.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: relationTargetIds },
            delFlag: "0",
          },
          select: {
            id: true,
            taskName: true,
          },
        })
      : [];
  const relationTargetMap = new Map(relationTargets.map((row) => [String(row.id), row.taskName]));

  const attachmentIds = attachmentRelRows.map((row) => row.attachmentId);
  const attachments =
    attachmentIds.length > 0
      ? await prisma.attachment.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: attachmentIds },
            delFlag: "0",
          },
          orderBy: { createTime: "desc" },
        })
      : [];
  const attachmentMap = new Map(attachments.map((row) => [String(row.id), toAttachment(row)]));

  const tagIds = tagRelRows.map((row) => row.tagId);
  const tags =
    tagIds.length > 0
      ? await prisma.tag.findMany({
          where: {
            tenantId: ctx.tenantId,
            id: { in: tagIds },
            delFlag: "0",
          },
          orderBy: { createTime: "asc" },
        })
      : [];
  const tagMap = new Map(tags.map((row) => [String(row.id), toTag(row)]));

  return {
    ...task,
    project,
    assignee,
    creator,
    collaborators,
    subtaskSummary: {
      total: subtaskRows.length,
      completed: subtaskRows.filter((row) => row.status === "1").length,
    },
    subtasks: subtaskRows.map((row) => toSubtask(row)),
    comments: commentRows.map((row) => ({
      ...toTaskComment(row),
      user: commentUsers.get(String(row.commentUserId)) ?? null,
    })),
    activities: activityRows.map((row) => ({
      ...toTaskActivity(row),
      user: activityUsers.get(String(row.actionUserId)) ?? null,
    })),
    relations: relationRows.map((row) => ({
      id: fromDbId(row.id)!,
      relationType: row.relationType,
      targetId: fromDbId(row.toTaskId),
      targetTitle: (row.toTaskId && relationTargetMap.get(String(row.toTaskId))) || "关联任务",
      targetUrl: undefined,
      createTime: row.createTime.toISOString(),
    })),
    attachments: attachmentRelRows
      .map((row) => attachmentMap.get(String(row.attachmentId)))
      .filter((item): item is Attachment => Boolean(item)),
    tags: tagRelRows.map((row) => tagMap.get(String(row.tagId))).filter((item): item is Tag => Boolean(item)),
    isFavorite: false,
    dueText: buildDueText(task),
    dueCategory: buildDueCategory(task),
  };
}

async function buildTaskListViews(ctx: AuthContext, tasks: Task[]) {
  return Promise.all(tasks.map((task) => buildTaskView(ctx, task)));
}

export const taskService = {
  async list(ctx: AuthContext, query: TaskListQuery) {
    if (query.projectId) {
      await ensureProjectAccess(ctx, query.projectId);
    }

    if (query.favorite === "true") {
      return query.view === "kanban"
        ? { notStarted: [], inProgress: [], completed: [], delayed: [] }
        : [];
    }

    let scopeTaskIds: string[] | null = null;
    if (query.scope === "collaborated") {
      const rows = await prisma.taskCollaborator.findMany({
        where: {
          tenantId: ctx.tenantId,
          userId: toDbId(ctx.userId),
          delFlag: "0",
        },
        select: {
          taskId: true,
        },
      });

      scopeTaskIds = rows.map((row) => String(row.taskId));
      if (scopeTaskIds.length === 0) {
        return query.view === "kanban"
          ? { notStarted: [], inProgress: [], completed: [], delayed: [] }
          : [];
      }
    }

    let tagTaskIds: string[] | null = null;
    if (query.tagId) {
      const rows = await prisma.taskTagRel.findMany({
        where: {
          tenantId: ctx.tenantId,
          tagId: toDbId(query.tagId),
        },
        select: {
          taskId: true,
        },
      });

      tagTaskIds = rows.map((row) => String(row.taskId));
      if (tagTaskIds.length === 0) {
        return query.view === "kanban"
          ? { notStarted: [], inProgress: [], completed: [], delayed: [] }
          : [];
      }
    }

    const now = new Date();
    const statusFilter =
      query.status === "3"
        ? {
            OR: [{ status: "3" }, { status: { not: "2" }, dueTime: { lt: now } }],
          }
        : query.status === "2"
          ? { status: "2" }
          : query.status === "1"
            ? {
                status: "1",
                OR: [{ dueTime: null }, { dueTime: { gte: now } }],
              }
            : query.status === "0"
              ? {
                  status: "0",
                  OR: [{ dueTime: null }, { dueTime: { gte: now } }],
                }
              : {}

    const rows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(query.projectId ? { projectId: toDbId(query.projectId) } : {}),
        ...statusFilter,
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.assigneeUserId ? { assigneeUserId: toDbId(query.assigneeUserId) } : {}),
        ...(query.creatorUserId ? { creatorUserId: toDbId(query.creatorUserId) } : {}),
        ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
        ...(query.scope === "owned" ? { assigneeUserId: toDbId(ctx.userId) } : {}),
        ...(query.scope === "created" ? { creatorUserId: toDbId(ctx.userId) } : {}),
        ...(scopeTaskIds ? { id: { in: scopeTaskIds.map((id) => toDbId(id)) } } : {}),
        ...(tagTaskIds ? { id: { in: tagTaskIds.map((id) => toDbId(id)) } } : {}),
        ...(query.keyword
          ? {
              OR: [
                { taskName: { contains: query.keyword, mode: "insensitive" } },
                { taskDesc: { contains: query.keyword, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(query.dueRange === "today"
          ? {
              dueTime: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lte: new Date(new Date().setHours(23, 59, 59, 999)),
              },
            }
          : {}),
        ...(query.dueRange === "week"
          ? {
              dueTime: {
                gte: new Date(),
                lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            }
          : {}),
        ...(query.dueRange === "overdue" ? { dueTime: { lt: new Date() }, status: { not: "2" } } : {}),
      },
      orderBy: [{ dueTime: "asc" }, { priority: "desc" }, { createTime: "desc" }],
    });

    const views = await buildTaskListViews(ctx, rows.map((row) => toTask(row)));
    if (query.view === "kanban") {
      return views.reduce<Record<string, typeof views>>(
        (acc, item) => {
          const key = isDelayedTask(item) ? "delayed" : statusKanbanMap[item.status] ?? "notStarted";
          acc[key].push(item);
          return acc;
        },
        { notStarted: [], inProgress: [], completed: [], delayed: [] },
      );
    }

    return views;
  },

  async create(ctx: AuthContext, input: CreateTaskInput) {
    await ensureProjectAccess(ctx, input.projectId);

    const assignee = await getActiveUser(ctx, input.assigneeUserId);
    if (input.assigneeUserId && !assignee) {
      throw new AppError("Assignee not found", 404);
    }
    const collaboratorUserIds = normalizeCollaboratorUserIds(input.collaboratorUserIds, [input.assigneeUserId, ctx.userId]);

    const now = new Date();

    let created = await prisma.task.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: input.projectId ? toDbId(input.projectId) : null,
        taskName: input.taskName,
        taskDesc: input.taskDesc,
        assigneeUserId: input.assigneeUserId ? toDbId(input.assigneeUserId) : null,
        assigneeDeptId: assignee?.deptId ? toDbId(assignee.deptId) : null,
        creatorUserId: toDbId(ctx.userId),
        status: DEFAULT_STATUS,
        priority: input.priority ?? DEFAULT_PRIORITY,
        progress: new Prisma.Decimal(input.progress ?? 0),
        startTime: input.startTime ? new Date(input.startTime) : null,
        dueTime: input.dueTime ? new Date(input.dueTime) : null,
        finishTime: null,
        riskLevel: "0",
        parentTaskId: input.parentTaskId ? toDbId(input.parentTaskId) : null,
        createDept: ctx.deptId ? toDbId(ctx.deptId) : null,
        createBy: toDbId(ctx.userId),
        createTime: now,
        delFlag: "0",
      },
    });

    if (!created.taskNo) {
      created = await prisma.task.update({
        where: { id: created.id },
        data: { taskNo: `TASK-${String(created.id)}` },
      });
    }

    for (const userId of collaboratorUserIds) {
      const collaborator = await getActiveUser(ctx, userId);
      if (!collaborator) continue;

      await prisma.taskCollaborator.create({
        data: {
          tenantId: ctx.tenantId,
          taskId: created.id,
          userId: toDbId(userId),
          deptId: collaborator.deptId ? toDbId(collaborator.deptId) : null,
          createBy: toDbId(ctx.userId),
          createTime: now,
          delFlag: "0",
        },
      });
    }

    for (const tagId of input.tagIds) {
      await ensureTagExists(ctx, tagId);
      await prisma.taskTagRel.create({
        data: {
          tenantId: ctx.tenantId,
          taskId: created.id,
          tagId: toDbId(tagId),
          createBy: toDbId(ctx.userId),
          createTime: now,
        },
      });
    }

    for (const attachmentId of input.attachmentIds) {
      await ensureAttachmentExists(ctx, attachmentId);
      await prisma.taskAttachmentRel.create({
        data: {
          tenantId: ctx.tenantId,
          taskId: created.id,
          attachmentId: toDbId(attachmentId),
          createBy: toDbId(ctx.userId),
          createTime: now,
        },
      });
    }

    await logTaskActivity(ctx, String(created.id), "create", `创建任务：${input.taskName}`);
    await refreshProjectProgress(ctx, fromDbId(created.projectId));

    return buildTaskView(ctx, toTask(created));
  },

  async detail(ctx: AuthContext, id: string) {
    const task = await getTaskOrThrow(ctx, id);
    return buildTaskView(ctx, toTask(task));
  },

  async update(ctx: AuthContext, id: string, input: UpdateTaskInput) {
    const existing = await getTaskOrThrow(ctx, id);
    const nextProjectId = input.projectId ?? fromDbId(existing.projectId);

    await ensureProjectAccess(ctx, nextProjectId);

    const nextAssigneeUserId = input.assigneeUserId ?? fromDbId(existing.assigneeUserId);
    const assignee = await getActiveUser(ctx, nextAssigneeUserId);
    const nextCreatorUserId = fromDbId(existing.creatorUserId);
    const collaboratorUserIds =
      input.collaboratorUserIds == null
        ? undefined
        : normalizeCollaboratorUserIds(input.collaboratorUserIds, [nextAssigneeUserId, nextCreatorUserId]);

    const updated = await prisma.task.update({
      where: { id: existing.id },
      data: {
        projectId: nextProjectId ? toDbId(nextProjectId) : null,
        taskName: input.taskName ?? undefined,
        taskDesc: input.taskDesc ?? undefined,
        assigneeUserId: nextAssigneeUserId ? toDbId(nextAssigneeUserId) : null,
        assigneeDeptId: assignee?.deptId ? toDbId(assignee.deptId) : null,
        status: input.status ?? undefined,
        priority: input.priority ?? undefined,
        progress: typeof input.progress === "number" ? new Prisma.Decimal(input.progress) : undefined,
        startTime: input.startTime ? new Date(input.startTime) : input.startTime === undefined ? undefined : null,
        dueTime: input.dueTime ? new Date(input.dueTime) : input.dueTime === undefined ? undefined : null,
        finishTime: input.status === undefined ? undefined : input.status === "2" ? new Date() : null,
        riskLevel: input.riskLevel ?? undefined,
        parentTaskId:
          input.parentTaskId ? toDbId(input.parentTaskId) : input.parentTaskId === undefined ? undefined : null,
        updateBy: toDbId(ctx.userId),
        updateTime: new Date(),
      },
    });

    if (collaboratorUserIds) {
      await prisma.taskCollaborator.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          taskId: existing.id,
        },
      });

      for (const userId of collaboratorUserIds) {
        const collaborator = await getActiveUser(ctx, userId);
        if (!collaborator) continue;

        await prisma.taskCollaborator.create({
          data: {
            tenantId: ctx.tenantId,
            taskId: existing.id,
            userId: toDbId(userId),
            deptId: collaborator.deptId ? toDbId(collaborator.deptId) : null,
            createBy: toDbId(ctx.userId),
            createTime: new Date(),
            delFlag: "0",
          },
        });
      }
    }

    if (input.tagIds) {
      await prisma.taskTagRel.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          taskId: existing.id,
        },
      });

      for (const tagId of input.tagIds) {
        await ensureTagExists(ctx, tagId);
        await prisma.taskTagRel.create({
          data: {
            tenantId: ctx.tenantId,
            taskId: existing.id,
            tagId: toDbId(tagId),
            createBy: toDbId(ctx.userId),
            createTime: new Date(),
          },
        });
      }
    }

    if (input.attachmentIds) {
      await prisma.taskAttachmentRel.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          taskId: existing.id,
        },
      });

      for (const attachmentId of input.attachmentIds) {
        await ensureAttachmentExists(ctx, attachmentId);
        await prisma.taskAttachmentRel.create({
          data: {
            tenantId: ctx.tenantId,
            taskId: existing.id,
            attachmentId: toDbId(attachmentId),
            createBy: toDbId(ctx.userId),
            createTime: new Date(),
          },
        });
      }
    }

    await logTaskActivity(ctx, id, "update", `更新任务：${updated.taskName}`);
    await refreshProjectProgress(ctx, fromDbId(existing.projectId));
    if (fromDbId(existing.projectId) !== fromDbId(updated.projectId)) {
      await refreshProjectProgress(ctx, fromDbId(updated.projectId));
    }

    return buildTaskView(ctx, toTask(updated));
  },

  async remove(ctx: AuthContext, id: string) {
    const task = await getTaskOrThrow(ctx, id);

    await prisma.task.update({
      where: { id: task.id },
      data: {
        delFlag: "1",
        updateBy: toDbId(ctx.userId),
        updateTime: new Date(),
      },
    });

    await logTaskActivity(ctx, id, "delete", `删除任务：${task.taskName}`);
    await refreshProjectProgress(ctx, fromDbId(task.projectId));
    return { success: true };
  },

  async updateStatus(ctx: AuthContext, id: string, input: StatusInput) {
    return this.update(ctx, id, {
      status: input.status,
      ...(input.status === "2" ? { progress: 100 } : {}),
    });
  },

  async favorite(_ctx: AuthContext, _id: string) {
    return { success: true };
  },

  async unfavorite(_ctx: AuthContext, _id: string) {
    return { success: true };
  },

  async dashboard(ctx: AuthContext) {
    const [today, owned, created, risk] = await Promise.all([
      this.mustDoToday(ctx),
      this.list(ctx, { scope: "owned", dueRange: "week" }),
      this.list(ctx, { scope: "created", dueRange: "week" }),
      this.riskList(ctx),
    ]);

    return {
      today,
      owned: Array.isArray(owned) ? owned.slice(0, 6) : [],
      created: Array.isArray(created) ? created.slice(0, 6) : [],
      favorite: [],
      risk,
      summary: {
        total: today.length + risk.length,
        owned: Array.isArray(owned) ? owned.length : 0,
        today: today.length,
        risk: risk.length,
      },
    };
  },

  async mustDoToday(ctx: AuthContext) {
    const result = await this.list(ctx, { scope: "owned", dueRange: "today" });
    return Array.isArray(result) ? result : [];
  },

  async riskList(ctx: AuthContext) {
    const rows = await prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
      },
      orderBy: [{ dueTime: "asc" }, { priority: "desc" }, { createTime: "desc" }],
    });

    const views = await buildTaskListViews(ctx, rows.map((row) => toTask(row)));
    return views.filter((item) => isRiskTask(item) || isDelayedTask(item)).slice(0, 20);
  },

  async todo(ctx: AuthContext, query: TaskListQuery) {
    return this.list(ctx, query);
  },

  async listSubtasks(ctx: AuthContext, taskId: string) {
    await getTaskOrThrow(ctx, taskId);

    const rows = await prisma.subtask.findMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        delFlag: "0",
      },
      orderBy: [{ sortNo: "asc" }, { createTime: "asc" }],
    });

    return rows.map((row) => toSubtask(row));
  },

  async createSubtask(ctx: AuthContext, taskId: string, input: SubtaskInput) {
    await getTaskOrThrow(ctx, taskId);

    const row = await prisma.subtask.create({
      data: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        subtaskName: input.subtaskName,
        status: input.status ?? "0",
        sortNo: input.sortNo ?? null,
        createBy: toDbId(ctx.userId),
        createTime: new Date(),
        delFlag: "0",
      },
    });

    await logTaskActivity(ctx, taskId, "subtask_create", `新增子任务：${input.subtaskName}`);
    return toSubtask(row);
  },

  async updateSubtask(ctx: AuthContext, id: string, input: Partial<SubtaskInput>) {
    const row = await prisma.subtask.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: toDbId(id),
        delFlag: "0",
      },
    });

    if (!row) {
      throw new AppError("Subtask not found", 404);
    }

    await getTaskOrThrow(ctx, String(row.taskId));

    const updated = await prisma.subtask.update({
      where: { id: row.id },
      data: {
        subtaskName: input.subtaskName ?? undefined,
        status: input.status ?? undefined,
        sortNo: input.sortNo ?? undefined,
        updateBy: toDbId(ctx.userId),
        updateTime: new Date(),
      },
    });

    await logTaskActivity(ctx, String(row.taskId), "subtask_update", `更新子任务：${updated.subtaskName}`);
    return toSubtask(updated);
  },

  async deleteSubtask(ctx: AuthContext, id: string) {
    const row = await prisma.subtask.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: toDbId(id),
        delFlag: "0",
      },
    });

    if (!row) {
      throw new AppError("Subtask not found", 404);
    }

    await getTaskOrThrow(ctx, String(row.taskId));

    await prisma.subtask.update({
      where: { id: row.id },
      data: {
        delFlag: "1",
        updateBy: toDbId(ctx.userId),
        updateTime: new Date(),
      },
    });

    await logTaskActivity(ctx, String(row.taskId), "subtask_delete", `删除子任务：${row.subtaskName}`);
    return { success: true };
  },

  async listComments(ctx: AuthContext, taskId: string) {
    await getTaskOrThrow(ctx, taskId);

    const rows = await prisma.taskComment.findMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        delFlag: "0",
      },
      orderBy: { createTime: "desc" },
    });

    return Promise.all(
      rows.map(async (row) => ({
        ...toTaskComment(row),
        user: await getActiveUser(ctx, String(row.commentUserId)),
      })),
    );
  },

  async createComment(ctx: AuthContext, taskId: string, input: CommentInput) {
    await getTaskOrThrow(ctx, taskId);

    const row = await prisma.taskComment.create({
      data: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        commentUserId: toDbId(ctx.userId),
        content: input.content,
        parentCommentId: input.parentCommentId ? toDbId(input.parentCommentId) : null,
        createTime: new Date(),
        delFlag: "0",
      },
    });

    await logTaskActivity(ctx, taskId, "comment_create", "新增评论");
    return {
      ...toTaskComment(row),
      user: await getActiveUser(ctx, ctx.userId),
    };
  },

  async updateComment(ctx: AuthContext, id: string, input: CommentInput) {
    const row = await prisma.taskComment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: toDbId(id),
        delFlag: "0",
      },
    });

    if (!row) {
      throw new AppError("Comment not found", 404);
    }

    if (String(row.commentUserId) !== ctx.userId && !isManager(ctx)) {
      throw new AppError("No permission to update this comment", 403);
    }

    const updated = await prisma.taskComment.update({
      where: { id: row.id },
      data: {
        content: input.content,
        parentCommentId: input.parentCommentId ? toDbId(input.parentCommentId) : null,
      },
    });

    await logTaskActivity(ctx, String(row.taskId), "comment_update", "更新评论");
    return {
      ...toTaskComment(updated),
      user: await getActiveUser(ctx, String(updated.commentUserId)),
    };
  },

  async deleteComment(ctx: AuthContext, id: string) {
    const row = await prisma.taskComment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: toDbId(id),
        delFlag: "0",
      },
    });

    if (!row) {
      throw new AppError("Comment not found", 404);
    }

    if (String(row.commentUserId) !== ctx.userId && !isManager(ctx)) {
      throw new AppError("No permission to delete this comment", 403);
    }

    await prisma.taskComment.update({
      where: { id: row.id },
      data: {
        delFlag: "1",
      },
    });

    await logTaskActivity(ctx, String(row.taskId), "comment_delete", "删除评论");
    return { success: true };
  },

  async uploadFile(ctx: AuthContext, input: UploadFileInput) {
    const row = await prisma.attachment.create({
      data: {
        tenantId: ctx.tenantId,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize != null ? BigInt(input.fileSize) : null,
        fileType: input.fileType,
        storageType: input.storageType,
        uploadUserId: toDbId(ctx.userId),
        createTime: new Date(),
        delFlag: "0",
      },
    });

    return toAttachment(row);
  },

  async listAttachments(ctx: AuthContext, taskId: string) {
    await getTaskOrThrow(ctx, taskId);

    const rels = await prisma.taskAttachmentRel.findMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
      },
      orderBy: { createTime: "desc" },
    });

    if (rels.length === 0) {
      return [];
    }

    const rows = await prisma.attachment.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: rels.map((row) => row.attachmentId) },
        delFlag: "0",
      },
      orderBy: { createTime: "desc" },
    });

    return rows.map((row) => toAttachment(row));
  },

  async bindAttachments(ctx: AuthContext, taskId: string, input: BindAttachmentsInput) {
    await getTaskOrThrow(ctx, taskId);

    for (const attachmentId of input.attachmentIds) {
      await ensureAttachmentExists(ctx, attachmentId);

      const existed = await prisma.taskAttachmentRel.findFirst({
        where: {
          tenantId: ctx.tenantId,
          taskId: toDbId(taskId),
          attachmentId: toDbId(attachmentId),
        },
      });

      if (!existed) {
        await prisma.taskAttachmentRel.create({
          data: {
            tenantId: ctx.tenantId,
            taskId: toDbId(taskId),
            attachmentId: toDbId(attachmentId),
            createBy: toDbId(ctx.userId),
            createTime: new Date(),
          },
        });
      }
    }

    await logTaskActivity(ctx, taskId, "attachment_bind", "绑定附件");
    return this.listAttachments(ctx, taskId);
  },

  async unbindAttachment(ctx: AuthContext, taskId: string, attachmentId: string) {
    await getTaskOrThrow(ctx, taskId);

    await prisma.taskAttachmentRel.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        attachmentId: toDbId(attachmentId),
      },
    });

    await logTaskActivity(ctx, taskId, "attachment_unbind", "解绑附件");
    return { success: true };
  },

  async deleteAttachment(ctx: AuthContext, id: string) {
    const row = await ensureAttachmentExists(ctx, id);

    await prisma.attachment.update({
      where: { id: row.id },
      data: {
        delFlag: "1",
      },
    });

    return { success: true };
  },

  async listTags(ctx: AuthContext) {
    const rows = await prisma.tag.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
      },
      orderBy: [{ tagType: "asc" }, { createTime: "asc" }],
    });

    return rows.map((row) => toTag(row));
  },

  async createTag(ctx: AuthContext, input: CreateTagInput) {
    const row = await prisma.tag.create({
      data: {
        tenantId: ctx.tenantId,
        tagName: input.tagName,
        tagColor: input.tagColor,
        tagType: input.tagType ?? "task",
        createBy: toDbId(ctx.userId),
        createTime: new Date(),
        delFlag: "0",
      },
    });

    return toTag(row);
  },

  async bindTags(ctx: AuthContext, taskId: string, input: BindTagsInput) {
    await getTaskOrThrow(ctx, taskId);

    for (const tagId of input.tagIds) {
      await ensureTagExists(ctx, tagId);

      const existed = await prisma.taskTagRel.findFirst({
        where: {
          tenantId: ctx.tenantId,
          taskId: toDbId(taskId),
          tagId: toDbId(tagId),
        },
      });

      if (!existed) {
        await prisma.taskTagRel.create({
          data: {
            tenantId: ctx.tenantId,
            taskId: toDbId(taskId),
            tagId: toDbId(tagId),
            createBy: toDbId(ctx.userId),
            createTime: new Date(),
          },
        });
      }
    }

    await logTaskActivity(ctx, taskId, "tag_bind", "绑定标签");
    return this.detail(ctx, taskId);
  },

  async unbindTag(ctx: AuthContext, taskId: string, tagId: string) {
    await getTaskOrThrow(ctx, taskId);

    await prisma.taskTagRel.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
        tagId: toDbId(tagId),
      },
    });

    await logTaskActivity(ctx, taskId, "tag_unbind", "解绑标签");
    return { success: true };
  },

  async listRelations(ctx: AuthContext, taskId: string) {
    await getTaskOrThrow(ctx, taskId);

    const rows = await prisma.taskRelation.findMany({
      where: {
        tenantId: ctx.tenantId,
        fromTaskId: toDbId(taskId),
      },
      orderBy: { createTime: "desc" },
    });

    const targetIds = rows.map((row) => row.toTaskId).filter((value): value is bigint => value != null);
    const targetTasks =
      targetIds.length > 0
        ? await prisma.task.findMany({
            where: {
              tenantId: ctx.tenantId,
              id: { in: targetIds },
              delFlag: "0",
            },
            select: {
              id: true,
              taskName: true,
            },
          })
        : [];
    const targetMap = new Map(targetTasks.map((row) => [String(row.id), row.taskName]));

    return rows.map((row) => ({
      id: fromDbId(row.id)!,
      relationType: row.relationType,
      targetId: fromDbId(row.toTaskId),
      targetTitle: (row.toTaskId && targetMap.get(String(row.toTaskId))) || "关联任务",
      targetUrl: undefined,
      createTime: row.createTime.toISOString(),
    }));
  },

  async createRelation(ctx: AuthContext, taskId: string, input: RelationInput) {
    await getTaskOrThrow(ctx, taskId);

    if (!input.targetId) {
      throw new AppError("Current database schema only supports task-to-task relations", 400);
    }

    await getTaskOrThrow(ctx, input.targetId);

    const row = await prisma.taskRelation.create({
      data: {
        tenantId: ctx.tenantId,
        fromTaskId: toDbId(taskId),
        toTaskId: toDbId(input.targetId),
        relationType: input.relationType,
        createBy: toDbId(ctx.userId),
        createTime: new Date(),
      },
    });

    await logTaskActivity(ctx, taskId, "relation_create", `新增关联：${input.targetTitle}`);
    return {
      id: fromDbId(row.id)!,
      relationType: row.relationType,
      targetId: fromDbId(row.toTaskId),
      targetTitle: input.targetTitle,
      targetUrl: undefined,
      createTime: row.createTime.toISOString(),
    };
  },

  async deleteRelation(ctx: AuthContext, id: string) {
    const row = await prisma.taskRelation.findFirst({
      where: {
        tenantId: ctx.tenantId,
        id: toDbId(id),
      },
    });

    if (!row) {
      throw new AppError("Relation not found", 404);
    }

    await getTaskOrThrow(ctx, String(row.fromTaskId));
    await prisma.taskRelation.delete({ where: { id: row.id } });
    await logTaskActivity(ctx, String(row.fromTaskId), "relation_delete", "删除关联");
    return { success: true };
  },

  async listActivities(ctx: AuthContext, taskId: string) {
    await getTaskOrThrow(ctx, taskId);

    const rows = await prisma.taskActivity.findMany({
      where: {
        tenantId: ctx.tenantId,
        taskId: toDbId(taskId),
      },
      orderBy: { createTime: "desc" },
    });

    return Promise.all(
      rows.map(async (row) => ({
        ...toTaskActivity(row),
        user: await getActiveUser(ctx, String(row.actionUserId)),
      })),
    );
  },

  async workload(ctx: AuthContext, query: WorkloadQuery) {
    const days = query.range === "month" ? 30 : 7;
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        status: "0",
      },
      orderBy: { userId: "asc" },
    });

    const result = [];
    for (const user of users) {
      const tasks = await prisma.task.findMany({
        where: {
          tenantId: ctx.tenantId,
          delFlag: "0",
          assigneeUserId: user.userId,
          status: { not: "3" },
          OR: [{ dueTime: null }, { dueTime: { lte: end } }],
        },
      });

      const urgentCount = tasks.filter((task) => ["2", "3"].includes(task.riskLevel ?? "0")).length;
      result.push({
        userId: String(user.userId),
        nickName: user.nickName,
        taskCount: tasks.length,
        urgentCount,
        loadPercent: Math.min(100, tasks.length * 20 + urgentCount * 10),
      });
    }

    return result;
  },
};
