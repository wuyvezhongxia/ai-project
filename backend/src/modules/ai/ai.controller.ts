import type { Response } from "express";
import { z } from "zod";

import { idSchema, toDbId } from "../../common/db-values";
import { toAiRecord } from "../../common/db-mappers";
import { prisma } from "../../common/prisma";
import { ok, parseBody, parseQuery, AppError } from "../../common/http";
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

const aiHistoryQuerySchema = z.object({
  bizId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
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

// AI聊天（SSE流式）
export const aiChatStream = async (req: AuthedRequest, res: Response): Promise<void> => {
  if (!aiService.isAvailable()) {
    throw new AppError("AI功能暂不可用，请检查配置或联系管理员", 503);
  }

  const body = parseBody(aiSchema, req.body);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const aiResult = await aiService.streamChat(body, req.ctx, (token) => {
    res.write(`data: ${JSON.stringify({ type: "chunk", content: token })}\n\n`);
  });
  if (!aiResult.success) {
    res.write(`data: ${JSON.stringify({ type: "error", message: aiResult.error || "AI处理失败" })}\n\n`);
    res.end();
    return;
  }

  if (aiResult.requiresConfirmation) {
    const record = await createAiRecord(
      req,
      "chat",
      body.inputText,
      aiResult.output,
      body.bizId,
      aiResult.metadata,
    );
    res.write(
      `data: ${JSON.stringify({
        type: "confirmation_required",
        recordId: record.id,
        model: aiResult.metadata?.model ?? null,
        message: aiResult.confirmationData?.message ?? aiResult.output,
        confirmationData: aiResult.confirmationData,
      })}\n\n`,
    );
    res.end();
    return;
  }

  const record = await createAiRecord(
    req,
    "chat",
    body.inputText,
    aiResult.output,
    body.bizId,
    aiResult.metadata,
  );

  res.write(
    `data: ${JSON.stringify({
      type: "done",
      recordId: record.id,
      model: aiResult.metadata?.model ?? null,
      suggestions: aiResult.suggestions ?? [],
      content: aiResult.output,
    })}\n\n`,
  );
  res.end();
};

// 周报生成
export const weeklyReport = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "weekly_report", (params, ctx) =>
    aiService.generateWeeklyReport(params as SkillParams, ctx)
  );
};

// 项目分析（API 路径仍为 task-breakdown）
export const taskBreakdown = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "task_breakdown", (params, ctx) =>
    aiService.breakdownTask(params as SkillParams, ctx)
  );
};

// 批量调整（预览：不落库，执行请在对话中确认）
export const delayAnalysis = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "batch_adjust_preview", (params, ctx) =>
    aiService.previewBatchAdjust(params as SkillParams, ctx)
  );
};

export const taskInsight = async (req: AuthedRequest, res: Response): Promise<void> => {
  await handleAiRequest(req, res, "task_insight", (params, ctx) =>
    aiService.generateTaskInsight(params as SkillParams, ctx)
  );
};

// AI历史会话（按用户与租户隔离，可选按项目bizId筛选）
export const aiHistory = async (req: AuthedRequest, res: Response): Promise<void> => {
  const query = parseQuery(aiHistoryQuerySchema, req.query);
  const where = {
    tenantId: req.ctx.tenantId,
    createBy: toDbId(req.ctx.userId),
    ...(query.bizId ? { bizId: toDbId(query.bizId) } : {}),
  };

  const rows = await prisma.aiRecord.findMany({
    where,
    orderBy: { createTime: "desc" },
    take: query.limit,
  });

  const records = rows.reverse().map((row) => toAiRecord(row));
  ok(res, { records });
};

// AI操作确认
export const aiConfirm = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    // 检查AI功能是否可用
    if (!aiService.isAvailable()) {
      throw new AppError("AI功能暂不可用，请检查配置或联系管理员", 503);
    }

    const schema = z.object({
      action: z.string().min(1),
      params: z.record(z.string(), z.any()),
    });

    const body = parseBody(schema, req.body);

    // 调用AI服务确认方法
    const aiResult = await aiService.confirmAction(body.action, body.params, req.ctx);

    if (!aiResult.success) {
      throw new AppError(aiResult.error || "确认操作执行失败", 500);
    }

    // 创建记录（可选，记录确认操作）
    const record = await createAiRecord(
      req,
      "confirm_" + body.action,
      JSON.stringify(body.params),
      aiResult.output,
      undefined,
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
    console.error("AI确认操作处理失败:", error);
    throw new AppError(`确认操作失败: ${error instanceof Error ? error.message : "未知错误"}`, 500);
  }
};
