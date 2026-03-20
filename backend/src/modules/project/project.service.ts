import { z } from "zod";

import { db } from "../../common/data-store";
import { AppError } from "../../common/http";
import type { AuthContext, Project, ProjectMember, Task } from "../../common/types";
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

const now = () => new Date().toISOString();

const getActiveUser = (tenantId: string, userId: number) => {
  const user = db.users.find(
    (item) => item.userId === userId && item.tenantId === tenantId && item.status === "0" && item.delFlag === "0",
  );
  if (!user) {
    throw new AppError(`User ${userId} not found or disabled`, 400);
  }

  return user;
};

const getProjectOrThrow = (tenantId: string, id: number) => {
  const project = db.projects.find((item) => item.id === id && item.tenantId === tenantId && item.delFlag === "0");
  if (!project) {
    throw new AppError("Project not found", 404);
  }

  return project;
};

const ensureProjectManager = (ctx: AuthContext, project: Project) => {
  if (project.ownerUserId === ctx.userId || ctx.roleIds.includes(1)) {
    return;
  }

  throw new AppError("No permission to manage project", 403);
};

const projectMembers = (tenantId: string, projectId: number) =>
  db.projectMembers.filter((item) => item.tenantId === tenantId && item.projectId === projectId && item.delFlag === "0");

const projectTasks = (tenantId: string, projectId: number) =>
  db.tasks.filter((item) => item.tenantId === tenantId && item.projectId === projectId && item.delFlag === "0");

const decorateProject = (project: Project) => {
  const owner = db.users.find((item) => item.userId === project.ownerUserId);
  const members = projectMembers(project.tenantId, project.id);
  const tasks = projectTasks(project.tenantId, project.id);
  const tags = db.projectTagRels
    .filter((item) => item.projectId === project.id && item.tenantId === project.tenantId)
    .map((rel) => db.tags.find((tag) => tag.id === rel.tagId && tag.delFlag === "0"))
    .filter(Boolean);

  return {
    ...project,
    owner,
    membersCount: members.length,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((item) => item.status === "3").length,
    tags,
  };
};

export const projectService = {
  list(ctx: AuthContext, query: ProjectListQuery) {
    const joinedProjectIds = new Set(
      db.projectMembers
        .filter((item) => item.tenantId === ctx.tenantId && item.userId === ctx.userId && item.delFlag === "0")
        .map((item) => item.projectId),
    );

    return db.projects
      .filter((item) => {
        if (item.tenantId !== ctx.tenantId || item.delFlag !== "0") {
          return false;
        }

        if (query.keyword && !item.projectName.includes(query.keyword)) {
          return false;
        }

        if (query.status && item.status !== query.status) {
          return false;
        }

        if (query.ownerUserId && item.ownerUserId !== query.ownerUserId) {
          return false;
        }

        if (query.creatorUserId && item.createBy !== query.creatorUserId) {
          return false;
        }

        if (query.joinedOnly === "true" && !joinedProjectIds.has(item.id)) {
          return false;
        }

        return true;
      })
      .map(decorateProject);
  },

  create(ctx: AuthContext, input: CreateProjectInput) {
    const owner = getActiveUser(ctx.tenantId, input.ownerUserId);
    const createdAt = now();
    const project: Project = {
      id: db.nextId("project"),
      tenantId: ctx.tenantId,
      projectCode: input.projectCode,
      projectName: input.projectName,
      projectDesc: input.projectDesc,
      ownerUserId: input.ownerUserId,
      ownerDeptId: owner.deptId,
      status: "0",
      priority: input.priority,
      startTime: input.startTime,
      endTime: input.endTime,
      progress: 0,
      visibility: input.visibility ?? "1",
      createDept: ctx.deptId,
      createBy: ctx.userId,
      createTime: createdAt,
      delFlag: "0",
    };

    db.projects.push(project);

    const memberUserIds = Array.from(new Set([input.ownerUserId, ...input.memberUserIds]));
    memberUserIds.forEach((userId) => {
      const user = getActiveUser(ctx.tenantId, userId);
      const member: ProjectMember = {
        id: db.nextId("projectMember"),
        tenantId: ctx.tenantId,
        projectId: project.id,
        userId,
        deptId: user.deptId,
        roleType: userId === input.ownerUserId ? "owner" : "member",
        joinType: userId === ctx.userId ? "create" : "invite",
        createBy: ctx.userId,
        createTime: createdAt,
        delFlag: "0",
      };
      db.projectMembers.push(member);
    });

    input.tagIds.forEach((tagId: number) => {
      db.projectTagRels.push({
        id: db.nextId("projectTagRel"),
        tenantId: ctx.tenantId,
        projectId: project.id,
        tagId,
        createBy: ctx.userId,
        createTime: createdAt,
      });
    });

    return decorateProject(project);
  },

  detail(ctx: AuthContext, id: number) {
    const project = getProjectOrThrow(ctx.tenantId, id);
    const tasks = projectTasks(ctx.tenantId, id);

    return {
      ...decorateProject(project),
      statistics: {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((item) => item.status === "3").length,
        overdueTasks: tasks.filter((item) => item.status !== "3" && item.dueTime && new Date(item.dueTime) < new Date()).length,
        progress: tasks.length === 0 ? 0 : Number(((tasks.filter((item) => item.status === "3").length / tasks.length) * 100).toFixed(2)),
      },
    };
  },

  update(ctx: AuthContext, id: number, input: UpdateProjectInput) {
    const project = getProjectOrThrow(ctx.tenantId, id);
    ensureProjectManager(ctx, project);

    if (input.ownerUserId) {
      const owner = getActiveUser(ctx.tenantId, input.ownerUserId);
      project.ownerUserId = input.ownerUserId;
      project.ownerDeptId = owner.deptId;
    }

    Object.assign(project, {
      projectCode: input.projectCode ?? project.projectCode,
      projectName: input.projectName ?? project.projectName,
      projectDesc: input.projectDesc ?? project.projectDesc,
      priority: input.priority ?? project.priority,
      startTime: input.startTime ?? project.startTime,
      endTime: input.endTime ?? project.endTime,
      visibility: input.visibility ?? project.visibility,
      status: input.status ?? project.status,
      updateBy: ctx.userId,
      updateTime: now(),
    });

    return decorateProject(project);
  },

  remove(ctx: AuthContext, id: number) {
    const project = getProjectOrThrow(ctx.tenantId, id);
    ensureProjectManager(ctx, project);

    const activeTasks = projectTasks(ctx.tenantId, id);
    if (activeTasks.length > 0) {
      throw new AppError("Project still contains active tasks", 400);
    }

    project.delFlag = "1";
    project.updateBy = ctx.userId;
    project.updateTime = now();
    return { success: true };
  },

  archive(ctx: AuthContext, id: number) {
    return this.update(ctx, id, { status: "2" });
  },

  options(ctx: AuthContext) {
    return db.projects
      .filter((item) => item.tenantId === ctx.tenantId && item.delFlag === "0")
      .map((item) => ({ id: item.id, projectName: item.projectName, status: item.status }));
  },

  listMembers(ctx: AuthContext, projectId: number) {
    getProjectOrThrow(ctx.tenantId, projectId);
    return projectMembers(ctx.tenantId, projectId).map((item) => ({
      ...item,
      user: db.users.find((user) => user.userId === item.userId),
    }));
  },

  addMembers(ctx: AuthContext, projectId: number, input: AddMembersInput) {
    const project = getProjectOrThrow(ctx.tenantId, projectId);
    ensureProjectManager(ctx, project);

    input.members.forEach((memberInput: AddMembersInput["members"][number]) => {
      const user = getActiveUser(ctx.tenantId, memberInput.userId);
      const exists = db.projectMembers.find(
        (item) =>
          item.tenantId === ctx.tenantId &&
          item.projectId === projectId &&
          item.userId === memberInput.userId &&
          item.delFlag === "0",
      );

      if (exists) {
        throw new AppError(`User ${memberInput.userId} already exists in project`, 409);
      }

      db.projectMembers.push({
        id: db.nextId("projectMember"),
        tenantId: ctx.tenantId,
        projectId,
        userId: memberInput.userId,
        deptId: user.deptId,
        roleType: memberInput.roleType,
        joinType: "invite",
        createBy: ctx.userId,
        createTime: now(),
        delFlag: "0",
      });
    });

    return this.listMembers(ctx, projectId);
  },

  removeMember(ctx: AuthContext, projectId: number, userId: number) {
    const project = getProjectOrThrow(ctx.tenantId, projectId);
    ensureProjectManager(ctx, project);

    if (project.ownerUserId === userId) {
      throw new AppError("Transfer project owner before removing owner member", 400);
    }

    const member = db.projectMembers.find(
      (item) => item.tenantId === ctx.tenantId && item.projectId === projectId && item.userId === userId && item.delFlag === "0",
    );
    if (!member) {
      throw new AppError("Project member not found", 404);
    }

    member.delFlag = "1";
    return { success: true };
  },

  listProjectTasks(ctx: AuthContext, projectId: number, view?: string) {
    getProjectOrThrow(ctx.tenantId, projectId);
    const tasks = projectTasks(ctx.tenantId, projectId).map((item) => ({
      ...item,
      assignee: item.assigneeUserId ? db.users.find((user) => user.userId === item.assigneeUserId) : null,
    }));

    if (view === "kanban") {
      return {
        notStarted: tasks.filter((item) => item.status === "0"),
        inProgress: tasks.filter((item) => item.status === "1"),
        review: tasks.filter((item) => item.status === "2"),
        done: tasks.filter((item) => item.status === "3"),
        delayed: tasks.filter((item) => item.status === "4"),
      };
    }

    return tasks;
  },

  getGantt(ctx: AuthContext, projectId: number) {
    return projectTasks(ctx.tenantId, projectId).map((item: Task) => ({
      taskId: item.id,
      taskName: item.taskName,
      startTime: item.startTime,
      dueTime: item.dueTime,
      progress: item.progress,
      status: item.status,
    }));
  },

  getStatistics(ctx: AuthContext, projectId: number) {
    const tasks = projectTasks(ctx.tenantId, projectId);
    const total = tasks.length;
    const completed = tasks.filter((item) => item.status === "3").length;
    const delayed = tasks.filter((item) => item.status === "4").length;
    const overdue = tasks.filter((item) => item.status !== "3" && item.dueTime && new Date(item.dueTime) < new Date()).length;

    return {
      totalTasks: total,
      completedTasks: completed,
      delayedTasks: delayed,
      overdueTasks: overdue,
      completionRate: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(2)),
    };
  },
};
