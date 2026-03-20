import type { Response } from "express";
import { z } from "zod";

import { db } from "../../common/data-store";
import { ok, parseBody } from "../../common/http";
import type { AuthedRequest } from "../../common/types";

const aiSchema = z.object({
  bizId: z.number().int().positive().optional(),
  inputText: z.string().min(1),
});

const createRecord = (req: AuthedRequest, bizType: string, inputText: string, bizId?: number) => {
  const tenant = db.tenants.find((item) => item.tenantId === req.ctx.tenantId);
  const outputText = `[${bizType}] mock result for: ${inputText}`;

  const record = {
    id: db.nextId("aiRecord"),
    tenantId: req.ctx.tenantId,
    bizType,
    bizId,
    inputText,
    outputText,
    modelId: tenant?.llmId,
    createBy: req.ctx.userId,
    createTime: new Date().toISOString(),
  };

  db.aiRecords.push(record);
  return record;
};

const buildAiHandler =
  (bizType: string) =>
  (req: AuthedRequest, res: Response): void => {
    const body = parseBody(aiSchema, req.body);
    const record = createRecord(req, bizType, body.inputText, body.bizId);
    ok(res, record, "AI request accepted", 201);
  };

export const aiChat = buildAiHandler("chat");
export const weeklyReport = buildAiHandler("weekly_report");
export const taskBreakdown = buildAiHandler("task_breakdown");
export const delayAnalysis = buildAiHandler("risk_analysis");
export const projectProgress = buildAiHandler("project_progress");
export const taskInsight = buildAiHandler("task_insight");
