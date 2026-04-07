import { Router } from "express";

import { asyncHandler } from "../../../common/http";
import { aiChat, aiChatStream, aiHistory, delayAnalysis, taskBreakdown, taskInsight, weeklyReport, aiConfirm } from "../ai.controller";

const router = Router();

router.post("/chat", asyncHandler(aiChat));
router.post("/chat/stream", asyncHandler(aiChatStream));
router.get("/history", asyncHandler(aiHistory));
router.post("/weekly-report", asyncHandler(weeklyReport));
router.post("/task-breakdown", asyncHandler(taskBreakdown));
router.post("/delay-analysis", asyncHandler(delayAnalysis));
router.post("/task-insight", asyncHandler(taskInsight));
router.post("/confirm", asyncHandler(aiConfirm));

export const aiRouter = router;
