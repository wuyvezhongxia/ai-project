import { Router } from "express";

import { asyncHandler } from "../../common/http";
import { aiChat, delayAnalysis, projectProgress, taskBreakdown, taskInsight, weeklyReport } from "./ai.controller";

const router = Router();

router.post("/chat", asyncHandler(aiChat));
router.post("/weekly-report", asyncHandler(weeklyReport));
router.post("/task-breakdown", asyncHandler(taskBreakdown));
router.post("/delay-analysis", asyncHandler(delayAnalysis));
router.post("/project-progress", asyncHandler(projectProgress));
router.post("/task-insight", asyncHandler(taskInsight));

export const aiRouter = router;
