import { Router } from "express";

import { asyncHandler } from "../../common/http";
import {
  addProjectMembers,
  archiveProject,
  createProject,
  deleteProject,
  getProjectDetail,
  getProjectGantt,
  getProjectStatistics,
  listProjectMembers,
  listProjectOptions,
  listProjects,
  listProjectTasks,
  removeProjectMember,
  updateProject,
} from "./project.controller";

const router = Router();

router.get("/", asyncHandler(listProjects));
router.post("/", asyncHandler(createProject));
router.get("/options", asyncHandler(listProjectOptions));
router.get("/:id", asyncHandler(getProjectDetail));
router.patch("/:id", asyncHandler(updateProject));
router.delete("/:id", asyncHandler(deleteProject));
router.patch("/:id/archive", asyncHandler(archiveProject));
router.get("/:id/members", asyncHandler(listProjectMembers));
router.post("/:id/members", asyncHandler(addProjectMembers));
router.delete("/:id/members/:userId", asyncHandler(removeProjectMember));
router.get("/:id/tasks", asyncHandler(listProjectTasks));
router.get("/:id/gantt", asyncHandler(getProjectGantt));
router.get("/:id/statistics", asyncHandler(getProjectStatistics));

export const projectRouter = router;
