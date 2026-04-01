import { z } from "zod";

import { toDbId } from "../../common/db-values";
import { prisma } from "../../common/prisma";
import { env } from "../../config/env";
import type { AuthContext } from "../../common/types";

const chatSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().optional(),
});

const skillSchema = z.object({
  inputText: z.string().min(1).max(5000),
  bizId: z.string().min(1),
});

export type ChatParams = z.infer<typeof chatSchema>;
export type SkillParams = z.infer<typeof skillSchema>;

export interface AiResponse {
  success: boolean;
  output: string;
  suggestions?: string[];
  metadata?: {
    model: string;
    tokensUsed: number;
    responseTime: number;
  };
  error?: string;
}

const isNumericId = (value?: string) => Boolean(value && /^\d+$/.test(value));

const toProjectStatus = (status?: string | null) => {
  if (status === "0") return "进行中";
  if (status === "1") return "已完成";
  if (status === "2") return "已归档";
  if (status === "3") return "已关闭";
  return "未知";
};

const toTaskStatus = (status?: string | null) => {
  if (status === "0") return "待开始";
  if (status === "1") return "进行中";
  if (status === "2") return "已完成";
  if (status === "3") return "延期";
  return "未知";
};

const buildMeta = (start: number) => ({
  model: env.DEEPSEEK_MODEL || "rule-based",
  tokensUsed: 0,
  responseTime: Date.now() - start,
});

export class AiService {
  async chat(params: ChatParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = chatSchema.parse(params);

      const [projectCount, ownedTaskCount, riskTaskCount, recentTasks] = await Promise.all([
        prisma.project.count({
          where: { tenantId: ctx.tenantId, delFlag: "0" },
        }),
        prisma.task.count({
          where: {
            tenantId: ctx.tenantId,
            delFlag: "0",
            assigneeUserId: toDbId(ctx.userId),
          },
        }),
        prisma.task.count({
          where: {
            tenantId: ctx.tenantId,
            delFlag: "0",
            riskLevel: { in: ["2", "3"] },
            status: { not: "2" },
          },
        }),
        prisma.task.findMany({
          where: { tenantId: ctx.tenantId, delFlag: "0" },
          orderBy: { id: "desc" },
          select: { taskName: true, status: true },
          take: 3,
        }),
      ]);

      let detail = "";
      if (input.bizId && isNumericId(input.bizId)) {
        const project = await prisma.project.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
          select: { projectName: true, status: true, progress: true, endTime: true },
        });
        if (project) {
          detail = `\n你当前关注项目「${project.projectName}」，状态 ${toProjectStatus(project.status)}，进度 ${Number(
            project.progress ?? 0,
          ).toFixed(0)}%，截止时间 ${project.endTime?.toISOString().slice(0, 10) ?? "未设置"}。`;
        }
      }

      const recentText =
        recentTasks.length > 0
          ? `最近任务：${recentTasks.map((t) => `「${t.taskName}(${toTaskStatus(t.status)})」`).join("、")}。`
          : "最近暂无任务数据。";

      const output =
        `已收到你的问题：「${input.inputText}」。` +
        `\n当前租户共有 ${projectCount} 个项目，你负责 ${ownedTaskCount} 个任务，系统识别到 ${riskTaskCount} 个中高风险任务。` +
        `\n${recentText}${detail}\n` +
        `\n建议下一步：先确认优先级最高且临近截止的任务，再补充需要我深入分析的项目或任务 ID。`;

      return {
        success: true,
        output,
        suggestions: [
          "帮我总结今天最该先做的3件事",
          "分析我负责任务里的延期风险",
          "给我一版本周工作总结草稿",
        ],
        metadata: buildMeta(startedAt),
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "AI处理失败",
      };
    }
  }

  async generateWeeklyReport(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);

      if (!isNumericId(input.bizId)) {
        return { success: false, output: "", error: "bizId 必须是项目 ID" };
      }

      const [project, tasks] = await Promise.all([
        prisma.project.findFirst({
          where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
          select: { projectName: true, status: true, progress: true },
        }),
        prisma.task.findMany({
          where: { tenantId: ctx.tenantId, projectId: toDbId(input.bizId), delFlag: "0" },
          select: { taskName: true, status: true, riskLevel: true },
        }),
      ]);

      if (!project) {
        return { success: false, output: "", error: "项目不存在或无权限" };
      }

      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "2").length;
      const inProgress = tasks.filter((t) => t.status === "1").length;
      const delayed = tasks.filter((t) => t.status === "3").length;
      const risk = tasks.filter((t) => ["2", "3"].includes(t.riskLevel ?? "0")).length;

      const output = `# ${project.projectName} 周报草稿

- 项目状态：${toProjectStatus(project.status)}
- 当前进度：${Number(project.progress ?? 0).toFixed(0)}%
- 任务总数：${total}
- 已完成：${completed}
- 进行中：${inProgress}
- 延期：${delayed}
- 风险任务：${risk}

## 本周进展
- 团队围绕核心目标持续推进，完成项占比 ${total > 0 ? Math.round((completed / total) * 100) : 0}%。

## 风险与问题
- 当前延期任务 ${delayed} 项，风险任务 ${risk} 项，需要重点跟进责任人排期。

## 下周建议
- 优先清理延期任务，明确里程碑和验收口径。
- 对高风险任务增加每日追踪频率。`;

      return { success: true, output, metadata: buildMeta(startedAt) };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "周报生成失败",
      };
    }
  }

  async analyzeRisk(params: SkillParams, ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);

      if (!isNumericId(input.bizId)) {
        return { success: false, output: "", error: "bizId 必须是任务 ID" };
      }

      const task = await prisma.task.findFirst({
        where: { tenantId: ctx.tenantId, id: toDbId(input.bizId), delFlag: "0" },
        select: {
          taskName: true,
          status: true,
          priority: true,
          progress: true,
          dueTime: true,
          riskLevel: true,
        },
      });

      if (!task) {
        return { success: false, output: "", error: "任务不存在或无权限" };
      }

      let score = 20;
      if (task.status === "3") score += 40;
      if (["2", "3"].includes(task.riskLevel ?? "0")) score += 25;
      if ((task.progress == null ? 0 : Number(task.progress)) < 40) score += 10;
      if (task.priority === "0") score += 10;
      if (task.dueTime && task.dueTime.getTime() < Date.now()) score += 15;
      score = Math.min(score, 100);

      const level = score >= 75 ? "高" : score >= 45 ? "中" : "低";
      const output = `任务「${task.taskName}」风险分析结果：
- 风险分数：${score}
- 风险等级：${level}
- 当前状态：${toTaskStatus(task.status)}
- 截止时间：${task.dueTime?.toISOString().slice(0, 10) ?? "未设置"}

建议：
1. 立即确认剩余工作量和责任人计划。
2. 将任务拆分为更小里程碑并每日同步。
3. 对关键阻塞项设置明确截止时间。`;

      return { success: true, output, metadata: buildMeta(startedAt) };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "风险分析失败",
      };
    }
  }

  async breakdownTask(params: SkillParams, _ctx: AuthContext): Promise<AiResponse> {
    try {
      const startedAt = Date.now();
      const input = skillSchema.parse(params);
      const topic = input.inputText.trim();

      const output = `任务拆解建议（草稿）：
1. 需求澄清与验收标准定义
2. 方案设计与任务分工
3. 开发实现与联调
4. 测试验证与问题修复
5. 上线准备与复盘总结

原始任务：${topic}
建议你把每一步再细化到“负责人 + 截止时间 + 交付物”。`;

      return { success: true, output, metadata: buildMeta(startedAt) };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "任务拆解失败",
      };
    }
  }

  isAvailable(): boolean {
    return env.AI_FEATURE_ENABLED !== false;
  }
}
