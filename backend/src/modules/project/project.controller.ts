import type { Response } from "express";
import { z } from "zod";

import { ok, parseBody, parseParams, parseQuery } from "../../common/http";
import type { AuthedRequest } from "../../common/types";
import {
  addMembersSchema,
  createProjectSchema,
  idParamsSchema,
  memberParamsSchema,
  projectListQuerySchema,
  updateProjectSchema,
} from "./project.schemas";
import { projectService } from "./project.service";

const projectTasksQuerySchema = z.object({
  view: z.enum(["list", "kanban"]).optional(),
});

export const listProjects = async (req: AuthedRequest, res: Response) => {
  const query = parseQuery(projectListQuerySchema, req.query);
  ok(res, await projectService.list(req.ctx, query));
};

export const createProject = async (req: AuthedRequest, res: Response) => {
  const body = parseBody(createProjectSchema, req.body);
  ok(res, await projectService.create(req.ctx, body), "Project created", 201);
};

export const getProjectDetail = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.detail(req.ctx, params.id));
};

export const updateProject = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(updateProjectSchema, req.body);
  ok(res, await projectService.update(req.ctx, params.id, body), "Project updated");
};

export const deleteProject = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.remove(req.ctx, params.id), "Project deleted");
};

export const archiveProject = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.archive(req.ctx, params.id), "Project archived");
};

export const listProjectOptions = async (req: AuthedRequest, res: Response) => {
  ok(res, await projectService.options(req.ctx));
};

export const listProjectMembers = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.listMembers(req.ctx, params.id));
};

export const addProjectMembers = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(addMembersSchema, req.body);
  ok(res, await projectService.addMembers(req.ctx, params.id, body), "Members added", 201);
};

export const removeProjectMember = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(memberParamsSchema, req.params);
  ok(res, await projectService.removeMember(req.ctx, params.id, params.userId), "Member removed");
};

export const listProjectTasks = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const query = parseQuery(projectTasksQuerySchema, req.query);
  ok(res, await projectService.listProjectTasks(req.ctx, params.id, query.view));
};

export const getProjectGantt = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.getGantt(req.ctx, params.id));
};

export const getProjectStatistics = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, await projectService.getStatistics(req.ctx, params.id));
};
