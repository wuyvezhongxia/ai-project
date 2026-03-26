import { z } from "zod";

import { toDbId } from "../../common/db-values";
import { toProject, toProjectMember, toTag, toTask, toUserProfile } from "../../common/db-mappers";
import { prisma } from "../../common/prisma";
import { AppError } from "../../common/http";
import type { AuthContext, Project, ProjectMember } from "../../common/types";
import {
  addMembersSchema,
  createProjectSchema,
  projectListQuerySchema,
  updateProjectSchema,
} from "./project.schemas";

type CreateProjectInput = z.infer<typeof createProjectSchema>;
type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
type AddMembersInput = z.infer<typeof addMembersSchema>;

const now = () => new Date();

const getActiveUser = async (tenantId: string, userId: string) => {
  const user = await prisma.user.findFirst({
    where: { userId: toDbId(userId), tenantId, status: "0", delFlag: "0" },
  });
  if (!user) {
    throw new AppError(`User ${userId} not found or disabled`, 400);
  }

  return user;
};

const getProjectOrThrow = async (tenantId: string, id: string) => {
  const row = await prisma.project.findFirst({
    where: { id: toDbId(id), tenantId, delFlag: "0" },
  });
  if (!row) {
    throw new AppError("Project not found", 404);
  }

  return row;
};

const ensureProjectManager = (ctx: AuthContext, project: Project) => {
  if (project.ownerUserId === ctx.userId || ctx.roleIds.includes("1")) {
    return;
  }

  throw new AppError("No permission to manage project", 403);
};

const isDelayedTask = (task: { status: string; dueTime?: Date | string | null }) => {
  if (task.status === "3") return true;
  if (task.status === "2" || !task.dueTime) return false;

  const due = new Date(task.dueTime);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
};

const isRiskTask = (task: { status: string; riskLevel?: string | null; dueTime?: Date | string | null }) => {
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

const decorateProject = async (row: Awaited<ReturnType<typeof getProjectOrThrow>>) => {
  const project = toProject(row);
  const [owner, members, tasks, tagRels] = await Promise.all([
    prisma.user.findFirst({ where: { userId: row.ownerUserId } }),
    prisma.projectMember.findMany({
      where: { tenantId: row.tenantId, projectId: row.id, delFlag: "0" },
    }),
    prisma.task.findMany({
      where: { tenantId: row.tenantId, projectId: row.id, delFlag: "0" },
    }),
    prisma.projectTagRel.findMany({
      where: { tenantId: row.tenantId, projectId: row.id },
    }),
  ]);

  const tagIds = tagRels.map((r) => r.tagId);
  const tagRows =
    tagIds.length > 0
      ? await prisma.tag.findMany({
          where: { id: { in: tagIds }, delFlag: "0" },
        })
      : [];

  return {
    ...project,
    owner: owner ? toUserProfile(owner) : undefined,
    membersCount: members.length,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((item) => item.status === "2").length,
    riskTaskCount: tasks.filter((item) => isRiskTask(item)).length,
    delayedTaskCount: tasks.filter((item) => isDelayedTask(item)).length,
    tags: tagRows.map(toTag),
  };
};

export const projectService = {
  async list(ctx: AuthContext, query: ProjectListQuery) {
    const memberRows = await prisma.projectMember.findMany({
      where: { tenantId: ctx.tenantId, userId: toDbId(ctx.userId), delFlag: "0" },
      select: { projectId: true },
    });
    const joinedProjectIds = new Set(memberRows.map((m) => m.projectId));

    const rows = await prisma.project.findMany({
      where: {
        tenantId: ctx.tenantId,
        delFlag: "0",
        ...(query.keyword ? { projectName: { contains: query.keyword } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.ownerUserId !== undefined ? { ownerUserId: toDbId(query.ownerUserId) } : {}),
        ...(query.creatorUserId !== undefined ? { createBy: toDbId(query.creatorUserId) } : {}),
        ...(query.joinedOnly === "true" ? { id: { in: [...joinedProjectIds] } } : {}),
      },
      orderBy: { id: "desc" },
    });

    const filtered = query.joinedOnly === "true" && joinedProjectIds.size === 0 ? [] : rows;

    const decorated = await Promise.all(filtered.map((r) => decorateProject(r)));
    return decorated;
  },

  async create(ctx: AuthContext, input: CreateProjectInput) {
    const owner = await getActiveUser(ctx.tenantId, input.ownerUserId);
    const createdAt = now();

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          tenantId: ctx.tenantId,
          projectCode: input.projectCode,
          projectName: input.projectName,
          projectDesc: input.projectDesc,
          ownerUserId: toDbId(input.ownerUserId),
          ownerDeptId: owner.deptId,
          status: "0",
          priority: input.priority,
          startTime: input.startTime ? new Date(input.startTime) : null,
          endTime: input.endTime ? new Date(input.endTime) : null,
          progress: "0",
          visibility: input.visibility ?? "1",
          createDept: ctx.deptId ? toDbId(ctx.deptId) : null,
          createBy: toDbId(ctx.userId),
          createTime: createdAt,
          delFlag: "0",
        },
      });

      const memberUserIds = Array.from(new Set([input.ownerUserId, ...input.memberUserIds]));
      for (const userId of memberUserIds) {
        const user = await getActiveUser(ctx.tenantId, userId);
        await tx.projectMember.create({
          data: {
            tenantId: ctx.tenantId,
            projectId: p.id,
            userId: toDbId(userId),
            deptId: user.deptId,
            roleType: userId === input.ownerUserId ? "owner" : "member",
            joinType: userId === ctx.userId ? "create" : "invite",
            createBy: toDbId(ctx.userId),
            createTime: createdAt,
            delFlag: "0",
          },
        });
      }

      for (const tagId of input.tagIds) {
        await tx.projectTagRel.create({
          data: {
            tenantId: ctx.tenantId,
            projectId: p.id,
            tagId: toDbId(tagId),
            createBy: toDbId(ctx.userId),
            createTime: createdAt,
          },
        });
      }

      return p;
    });

    return decorateProject(project);
  },

  async detail(ctx: AuthContext, id: string) {
    const row = await getProjectOrThrow(ctx.tenantId, id);
    const tasks = await prisma.task.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(id), delFlag: "0" },
    });

    const base = await decorateProject(row);
    return {
      ...base,
      statistics: {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((item) => item.status === "2").length,
        overdueTasks: tasks.filter((item) => item.status !== "3" && item.dueTime && item.dueTime < new Date()).length,
        progress:
          tasks.length === 0
            ? 0
            : Number(((tasks.filter((item) => item.status === "2").length / tasks.length) * 100).toFixed(2)),
      },
    };
  },

  async update(ctx: AuthContext, id: string, input: UpdateProjectInput) {
    const row = await getProjectOrThrow(ctx.tenantId, id);
    const project = toProject(row);
    ensureProjectManager(ctx, project);

    let ownerDeptId = row.ownerDeptId;
    let ownerUserId = String(row.ownerUserId);
    if (input.ownerUserId) {
      const owner = await getActiveUser(ctx.tenantId, input.ownerUserId);
      ownerUserId = input.ownerUserId;
      ownerDeptId = owner.deptId;
    }

    const updated = await prisma.project.update({
      where: { id: toDbId(id) },
      data: {
        ownerUserId: toDbId(ownerUserId),
        ownerDeptId,
        projectCode: input.projectCode ?? row.projectCode,
        projectName: input.projectName ?? row.projectName,
        projectDesc: input.projectDesc ?? row.projectDesc,
        priority: input.priority ?? row.priority,
        startTime: input.startTime !== undefined ? (input.startTime ? new Date(input.startTime) : null) : row.startTime,
        endTime: input.endTime !== undefined ? (input.endTime ? new Date(input.endTime) : null) : row.endTime,
        visibility: input.visibility ?? row.visibility,
        status: input.status ?? row.status,
        updateBy: toDbId(ctx.userId),
        updateTime: now(),
      },
    });

    return decorateProject(updated);
  },

  async remove(ctx: AuthContext, id: string) {
    const row = await getProjectOrThrow(ctx.tenantId, id);
    const project = toProject(row);
    ensureProjectManager(ctx, project);

    const taskCount = await prisma.task.count({
      where: { tenantId: ctx.tenantId, projectId: toDbId(id), delFlag: "0" },
    });
    if (taskCount > 0) {
      throw new AppError("Project still contains active tasks", 400);
    }

    await prisma.project.update({
      where: { id: toDbId(id) },
      data: { delFlag: "1", updateBy: toDbId(ctx.userId), updateTime: now() },
    });
    return { success: true };
  },

  async archive(ctx: AuthContext, id: string) {
    return projectService.update(ctx, id, { status: "2" });
  },

  async options(ctx: AuthContext) {
    const rows = await prisma.project.findMany({
      where: { tenantId: ctx.tenantId, delFlag: "0" },
      select: { id: true, projectName: true, status: true },
      orderBy: { id: "desc" },
    });
    return rows.map((row) => ({
      id: String(row.id),
      projectName: row.projectName,
      status: row.status,
    }));
  },

  async listMembers(ctx: AuthContext, projectId: string) {
    await getProjectOrThrow(ctx.tenantId, projectId);
    const members = await prisma.projectMember.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), delFlag: "0" },
    });
    const userIds = [...new Set(members.map((m) => m.userId))];
    const users = await prisma.user.findMany({ where: { userId: { in: userIds } } });
    const userMap = new Map(users.map((u) => [u.userId, toUserProfile(u)]));

    return members.map((item) => ({
      ...toProjectMember(item),
      user: userMap.get(item.userId),
    }));
  },

  async addMembers(ctx: AuthContext, projectId: string, input: AddMembersInput) {
    const row = await getProjectOrThrow(ctx.tenantId, projectId);
    const project = toProject(row);
    ensureProjectManager(ctx, project);
    const createdAt = now();

    for (const memberInput of input.members) {
      await getActiveUser(ctx.tenantId, memberInput.userId);
      const exists = await prisma.projectMember.findFirst({
        where: {
          tenantId: ctx.tenantId,
          projectId: toDbId(projectId),
          userId: toDbId(memberInput.userId),
          delFlag: "0",
        },
      });

      if (exists) {
        throw new AppError(`User ${memberInput.userId} already exists in project`, 409);
      }

      const user = await getActiveUser(ctx.tenantId, memberInput.userId);
      await prisma.projectMember.create({
        data: {
          tenantId: ctx.tenantId,
          projectId: toDbId(projectId),
          userId: toDbId(memberInput.userId),
          deptId: user.deptId,
          roleType: memberInput.roleType,
          joinType: "invite",
          createBy: toDbId(ctx.userId),
          createTime: createdAt,
          delFlag: "0",
        },
      });
    }

    return projectService.listMembers(ctx, projectId);
  },

  async removeMember(ctx: AuthContext, projectId: string, userId: string) {
    const row = await getProjectOrThrow(ctx.tenantId, projectId);
    const project = toProject(row);
    ensureProjectManager(ctx, project);

    if (project.ownerUserId === userId) {
      throw new AppError("Transfer project owner before removing owner member", 400);
    }

    const member = await prisma.projectMember.findFirst({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), userId: toDbId(userId), delFlag: "0" },
    });
    if (!member) {
      throw new AppError("Project member not found", 404);
    }

    await prisma.projectMember.update({
      where: { id: member.id },
      data: { delFlag: "1" },
    });
    return { success: true };
  },

  async listProjectTasks(ctx: AuthContext, projectId: string, view?: string) {
    await getProjectOrThrow(ctx.tenantId, projectId);
    const taskRows = await prisma.task.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), delFlag: "0" },
      orderBy: { id: "desc" },
    });
    const assigneeIds = [...new Set(taskRows.map((t) => t.assigneeUserId).filter(Boolean))] as bigint[];
    const users = assigneeIds.length ? await prisma.user.findMany({ where: { userId: { in: assigneeIds } } }) : [];
    const userMap = new Map(users.map((u) => [u.userId, toUserProfile(u)]));

    const tasks = taskRows.map((item) => ({
      ...toTask(item),
      assignee: item.assigneeUserId ? userMap.get(item.assigneeUserId) : null,
    }));

    if (view === "kanban") {
      return {
        notStarted: tasks.filter((item) => item.status === "0" && !isDelayedTask(item)),
        inProgress: tasks.filter((item) => item.status === "1" && !isDelayedTask(item)),
        completed: tasks.filter((item) => item.status === "2"),
        delayed: tasks.filter((item) => isDelayedTask(item)),
      };
    }

    return tasks;
  },

  async getGantt(ctx: AuthContext, projectId: string) {
    await getProjectOrThrow(ctx.tenantId, projectId);
    const taskRows = await prisma.task.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), delFlag: "0" },
    });
    return taskRows.map((item) => {
      const t = toTask(item);
      return {
        taskId: t.id,
        taskName: t.taskName,
        startTime: t.startTime,
        dueTime: t.dueTime,
        progress: t.progress,
        status: t.status,
      };
    });
  },

  async getStatistics(ctx: AuthContext, projectId: string) {
    await getProjectOrThrow(ctx.tenantId, projectId);
    const tasks = await prisma.task.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), delFlag: "0" },
    });
    const total = tasks.length;
    const completed = tasks.filter((item) => item.status === "2").length;
    const delayed = tasks.filter((item) => isDelayedTask(item)).length;
    const overdue = tasks.filter((item) => item.status !== "3" && item.dueTime && item.dueTime < new Date()).length;

    return {
      totalTasks: total,
      completedTasks: completed,
      delayedTasks: delayed,
      overdueTasks: overdue,
      completionRate: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(2)),
    };
  },
};
