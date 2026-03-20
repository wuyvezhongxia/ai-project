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

export const listProjects = (req: AuthedRequest, res: Response) => {
  const query = parseQuery(projectListQuerySchema, req.query);
  ok(res, projectService.list(req.ctx, query));
};

export const createProject = (req: AuthedRequest, res: Response) => {
  const body = parseBody(createProjectSchema, req.body);
  ok(res, projectService.create(req.ctx, body), "Project created", 201);
};

export const getProjectDetail = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.detail(req.ctx, params.id));
};

export const updateProject = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(updateProjectSchema, req.body);
  ok(res, projectService.update(req.ctx, params.id, body), "Project updated");
};

export const deleteProject = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.remove(req.ctx, params.id), "Project deleted");
};

export const archiveProject = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.archive(req.ctx, params.id), "Project archived");
};

export const listProjectOptions = (req: AuthedRequest, res: Response) => {
  ok(res, projectService.options(req.ctx));
};

export const listProjectMembers = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.listMembers(req.ctx, params.id));
};

export const addProjectMembers = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const body = parseBody(addMembersSchema, req.body);
  ok(res, projectService.addMembers(req.ctx, params.id, body), "Members added", 201);
};

export const removeProjectMember = (req: AuthedRequest, res: Response) => {
  const params = parseParams(memberParamsSchema, req.params);
  ok(res, projectService.removeMember(req.ctx, params.id, params.userId), "Member removed");
};

export const listProjectTasks = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const query = parseQuery(projectTasksQuerySchema, req.query);
  ok(res, projectService.listProjectTasks(req.ctx, params.id, query.view));
};

export const getProjectGantt = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.getGantt(req.ctx, params.id));
};

export const getProjectStatistics = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  ok(res, projectService.getStatistics(req.ctx, params.id));
};
