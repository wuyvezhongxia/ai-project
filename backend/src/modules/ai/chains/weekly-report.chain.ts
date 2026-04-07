import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";
import { toProjectStatus } from "../core/ai.domain-format";

/** 链式步骤 1 产出：周报所需的聚合事实（无模板字符串）。 */
export type WeeklyReportFacts = {
  projectName: string;
  projectStatusLabel: string;
  progressPct: number;
  total: number;
  completed: number;
  inProgress: number;
  delayed: number;
  risk: number;
};

/**
 * 从库中加载项目及任务快照；若无项目则返回 null（调用方处理错误响应）。
 */
export async function loadWeeklyReportFacts(
  ctx: AuthContext,
  projectId: string,
): Promise<WeeklyReportFacts | null> {
  const [project, tasks] = await Promise.all([
    prisma.project.findFirst({
      where: { tenantId: ctx.tenantId, id: toDbId(projectId), delFlag: "0" },
      select: { projectName: true, status: true, progress: true },
    }),
    prisma.task.findMany({
      where: { tenantId: ctx.tenantId, projectId: toDbId(projectId), delFlag: "0" },
      select: { status: true, riskLevel: true },
    }),
  ]);

  if (!project) return null;

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "2").length;
  const inProgress = tasks.filter((t) => t.status === "1").length;
  const delayed = tasks.filter((t) => t.status === "3").length;
  const risk = tasks.filter((t) => ["2", "3"].includes(t.riskLevel ?? "0")).length;

  return {
    projectName: project.projectName ?? "",
    projectStatusLabel: toProjectStatus(project.status),
    progressPct: Number(project.progress ?? 0),
    total,
    completed,
    inProgress,
    delayed,
    risk,
  };
}

/**
 * 链式步骤 2：将事实渲染为 Markdown 周报草稿（纯函数，便于快照测试）。
 */
export function renderWeeklyReportMarkdown(f: WeeklyReportFacts): string {
  const pct = f.total > 0 ? Math.round((f.completed / f.total) * 100) : 0;
  return `# ${f.projectName} 周报草稿

- 项目状态：${f.projectStatusLabel}
- 当前进度：${f.progressPct.toFixed(0)}%
- 任务总数：${f.total}
- 已完成：${f.completed}
- 进行中：${f.inProgress}
- 延期：${f.delayed}
- 风险任务：${f.risk}

## 本周进展
- 团队围绕核心目标持续推进，完成项占比 ${pct}%。

## 风险与问题
- 当前延期任务 ${f.delayed} 项，风险任务 ${f.risk} 项，需要重点跟进责任人排期。

## 下周建议
- 优先清理延期任务，明确里程碑和验收口径。
- 对高风险任务增加每日追踪频率。`;
}
