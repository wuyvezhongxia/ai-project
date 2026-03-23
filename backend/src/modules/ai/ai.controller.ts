import type { Response } from "express";
import { z } from "zod";

import { idSchema, toDbId } from "../../common/db-values";
import { toAiRecord } from "../../common/db-mappers";
import { prisma } from "../../common/prisma";
import { ok, parseBody } from "../../common/http";
import type { AuthedRequest } from "../../common/types";

const aiSchema = z.object({
  bizId: idSchema.optional(),
  inputText: z.string().min(1),
});

const createRecord = async (req: AuthedRequest, bizType: string, inputText: string, bizId?: string) => {
  const tenant = await prisma.tenant.findFirst({ where: { tenantId: req.ctx.tenantId } });
  const outputText = `[${bizType}] mock result for: ${inputText}`;
  const nextRecordId = (
    await prisma.$queryRawUnsafe<Array<{ next_id: bigint }>>(
      `select coalesce(max(id), 0) + 1 as next_id from "public"."pm_ai_record"`,
    )
  )[0]?.next_id ?? 1n;

  const row = await prisma.aiRecord.create({
    data: {
      id: nextRecordId,
      tenantId: req.ctx.tenantId,
      bizType,
      bizId: bizId ? toDbId(bizId) : null,
      inputText,
      outputText,
      modelId: tenant?.llmId ?? null,
      createBy: toDbId(req.ctx.userId),
      createTime: new Date(),
    },
  });

  return toAiRecord(row);
};

const buildAiHandler =
  (bizType: string) =>
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const body = parseBody(aiSchema, req.body);
    const record = await createRecord(req, bizType, body.inputText, body.bizId);
    ok(res, record, "AI request accepted", 201);
  };

export const aiChat = buildAiHandler("chat");
export const weeklyReport = buildAiHandler("weekly_report");
export const taskBreakdown = buildAiHandler("task_breakdown");
export const delayAnalysis = buildAiHandler("risk_analysis");
export const projectProgress = buildAiHandler("project_progress");
export const taskInsight = buildAiHandler("task_insight");
