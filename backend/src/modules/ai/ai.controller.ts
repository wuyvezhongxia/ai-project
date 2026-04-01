import type { Response } from "express";
import { z } from "zod";

import { idSchema, toDbId } from "../../common/db-values";
import { toAiRecord } from "../../common/db-mappers";
import { prisma } from "../../common/prisma";
import { ok, parseBody, AppError } from "../../common/http";
import type { AuthedRequest } from "../../common/types";
import { AiService, type ChatParams, type SkillParams } from "./ai.service";

const aiSchema = z.object({
  bizId: idSchema.optional(),
  inputText: z.string().min(1),
});

const skillSchema = z.object({
  bizId: idSchema,
  inputText: z.string().min(1),
});

// 创建AI服务实例
const aiService = new AiService();

// 创建AI记录
const createAiRecord = async (
  req: AuthedRequest,
  bizType: string,
  inputText: string,
  outputText: string,
  bizId?: string,
  metadata?: any,
) => {
  const tenant = await prisma.tenant.findFirst({ where: { tenantId: req.ctx.tenantId } });

  const row = await prisma.aiRecord.create({
    data: {
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

// 通用AI处理函数
const handleAiRequest = async (
  req: AuthedRequest,
  res: Response,
  bizType: string,
  handler: (params: ChatParams | SkillParams, ctx: any) => Promise<any>,
) => {
  try {
    // 检查AI功能是否可用
    if (!aiService.isAvailable()) {
      throw new AppError("AI功能暂不可用，请检查配置或联系管理员", 503);
    }

    const body = parseBody(bizType === "chat" ? aiSchema : skillSchema, req.body);

    // 调用AI服务
    const aiResult = await handler(body, req.ctx);

    if (!aiResult.success) {
      throw new AppError(aiResult.error || "AI处理失败", 500);
    }

    // 创建记录
    const record = await createAiRecord(
      req,
      bizType,
      body.inputText,
      aiResult.output,
      body.bizId,
      aiResult.metadata,
    );

    // 返回结果
    ok(res, {
      ...aiResult,
      recordId: record.id,
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error(`AI请求处理失败 (${bizType}):`, error);
    throw new AppError(`AI处理失败: ${error instanceof Error ? error.message : "未知错误"}`, 500);
  }
};

// AI聊天
export const aiChat = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "chat", (params, ctx) =>
    aiService.chat(params as ChatParams, ctx)
  );
};

// 周报生成
export const weeklyReport = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "weekly_report", (params, ctx) =>
    aiService.generateWeeklyReport(params as SkillParams, ctx)
  );
};

// 任务拆解
export const taskBreakdown = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "task_breakdown", (params, ctx) =>
    aiService.breakdownTask(params as SkillParams, ctx)
  );
};

// 风险分析
export const delayAnalysis = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "risk_analysis", (params, ctx) =>
    aiService.analyzeRisk(params as SkillParams, ctx)
  );
};

// 项目进度（暂时使用通用聊天）
export const projectProgress = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "project_progress", (params, ctx) =>
    aiService.chat(params as ChatParams, ctx)
  );
};

// 任务洞察（暂时使用通用聊天）
export const taskInsight = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "task_insight", (params, ctx) =>
    aiService.chat(params as ChatParams, ctx)
  );
};
