import { toDbId } from "../../../../../common/db-values";
import { prisma } from "../../../../../common/prisma";
import {
  isNumericId,
  toTaskPriorityLabel,
  toTaskStatus,
} from "../../../core/ai.domain-format";
import {
  getProjectReportHeader,
  mapAssigneeNickNames,
} from "../../../services/task-read.service";
import type { ISkill, SkillParams, SkillContext, SkillResult } from "../../skill.types";
import { SkillCategory } from "../../skill.types";

type TaskRow = {
  id: bigint;
  taskName: string | null;
  taskDesc: string | null;
  status: string | null;
  progress: unknown;
  assigneeUserId: bigint | null;
  dueTime: Date | null;
  priority: string | null;
  riskLevel: string | null;
};

/**
 * 项目分析：基于关联项目与任务清单生成数据驱动报告（非模板化子任务拆解）
 */
export class TaskBreakdownSkill implements ISkill {
  id = "task-breakdown";
  name = "项目分析";
  description =
    "根据关联项目的任务列表生成项目概览、状态分布、延期与临期任务、负责人负载与改进建议";
  icon = "📋";
  category = SkillCategory.GENERATION;
  requiresConfirmation = false;
  supportsStreaming = true;
  availableModels = ["deepseek", "doubao"];

  tools = [];
  chains = [];
  prompts = [];

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId } = context;

    try {
      const resolved = await this.resolveProjectId(tenantId, context, input);
      if (!resolved.projectId) {
        return {
          success: true,
          output: resolved.hint ?? "无法确定要分析的项目，请先选择「关联项目」或在说明中写明项目。",
          skillId: this.id,
          tokensUsed: 0,
        };
      }

      const [header, tasks] = await Promise.all([
        getProjectReportHeader(tenantId, resolved.projectId),
        this.listProjectTasks(tenantId, resolved.projectId),
      ]);

      if (!header) {
        return {
          success: false,
          output: "项目不存在或无权限查看。",
          error: "项目不存在",
          skillId: this.id,
        };
      }

      const report = await this.buildProjectAnalysisReport(tenantId, header, tasks);
      return {
        success: true,
        output: report,
        skillId: this.id,
        tokensUsed: 0,
      };
    } catch (error) {
      console.error("项目分析失败:", error);
      return {
        success: false,
        output: "项目分析失败，请稍后重试。",
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  /** 优先把 bizId 当作项目 ID；否则当作任务 ID 反查项目；再尝试从文案中解析项目 ID */
  private async resolveProjectId(
    tenantId: string,
    context: SkillContext,
    input: string,
  ): Promise<{ projectId: string; hint?: string }> {
    const biz = context.bizId?.trim();
    if (isNumericId(biz)) {
      const asProject = await getProjectReportHeader(tenantId, biz!);
      if (asProject) return { projectId: biz! };
      const task = await prisma.task.findFirst({
        where: { tenantId, id: toDbId(biz!), delFlag: "0" },
        select: { projectId: true },
      });
      if (task?.projectId != null) return { projectId: String(task.projectId) };
    }

    const fromText = input.match(/(?:项目|project)\s*[#＃]?\s*(\d+)/i);
    if (fromText?.[1] && isNumericId(fromText[1])) {
      const pid = fromText[1];
      const h = await getProjectReportHeader(tenantId, pid);
      if (h) return { projectId: pid };
    }

    return {
      projectId: "",
      hint: "请先在工作助手中选择「关联项目」，或在说明中写明「项目 数字ID」。",
    };
  }

  private async listProjectTasks(tenantId: string, projectId: string): Promise<TaskRow[]> {
    return prisma.task.findMany({
      where: { tenantId, projectId: toDbId(projectId), delFlag: "0" },
      select: {
        id: true,
        taskName: true,
        taskDesc: true,
        status: true,
        progress: true,
        assigneeUserId: true,
        dueTime: true,
        priority: true,
        riskLevel: true,
      },
      orderBy: [{ dueTime: "asc" }, { id: "asc" }],
    });
  }

  private taskRiskLabel(r: string | null): string {
    const m: Record<string, string> = { "0": "无", "1": "低", "2": "中", "3": "高" };
    return m[r ?? "0"] ?? "无";
  }

  /** 任务进度加权：各任务 progress 字段算术平均（无任务时用项目进度） */
  private weightedProgressPct(tasks: TaskRow[], projectProgress: unknown): number {
    if (tasks.length === 0) return Number(projectProgress ?? 0);
    const sum = tasks.reduce((s, t) => s + Number(t.progress ?? 0), 0);
    return Math.round((sum / tasks.length) * 10) / 10;
  }

  private deriveOverallStatus(tasks: TaskRow[], now: Date): "正常" | "延期" | "高风险" {
    const highRisk = tasks.some((t) => ["2", "3"].includes(t.riskLevel ?? "0"));
    if (highRisk) return "高风险";
    const incomplete = (t: TaskRow) => (t.status ?? "") !== "2";
    const overdue = tasks.filter((t) => incomplete(t) && t.dueTime && t.dueTime.getTime() < now.getTime());
    const delayedFlag = tasks.some((t) => t.status === "3");
    if (delayedFlag || overdue.length > 0) return "延期";
    return "正常";
  }

  private async buildProjectAnalysisReport(
    tenantId: string,
    header: { id: bigint; projectName: string | null; status: string | null; progress: unknown },
    tasks: TaskRow[],
  ): Promise<string> {
    const now = new Date();
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);
    in7.setHours(23, 59, 59, 999);

    const assigneeIds = [...new Set(tasks.map((t) => t.assigneeUserId).filter((x): x is bigint => x != null))];
    const nickMap = await mapAssigneeNickNames(tenantId, assigneeIds);
    const nameOf = (uid: bigint | null) =>
      uid == null ? "未分配" : nickMap.get(uid)?.trim() || `用户${uid}`;

    const c0 = tasks.filter((t) => (t.status ?? "") === "0").length;
    const c1 = tasks.filter((t) => (t.status ?? "") === "1").length;
    const c2 = tasks.filter((t) => (t.status ?? "") === "2").length;
    const c3 = tasks.filter((t) => (t.status ?? "") === "3").length;

    const overdueTasks = tasks.filter(
      (t) => (t.status ?? "") !== "2" && t.dueTime && t.dueTime.getTime() < now.getTime(),
    );

    const dueSoonTasks = tasks.filter((t) => {
      if (!t.dueTime || (t.status ?? "") === "2") return false;
      const t0 = t.dueTime.getTime();
      return t0 >= now.getTime() && t0 <= in7.getTime();
    });

    const activeForLoad = tasks.filter((t) => ["0", "1", "3"].includes(t.status ?? ""));
    const loadByAssignee = new Map<string, number>();
    for (const t of activeForLoad) {
      const key = nameOf(t.assigneeUserId);
      loadByAssignee.set(key, (loadByAssignee.get(key) ?? 0) + 1);
    }
    const OVERLOAD_THRESHOLD = 8;
    const overloaded = [...loadByAssignee.entries()].filter(([, n]) => n >= OVERLOAD_THRESHOLD);

    const pct = this.weightedProgressPct(tasks, header.progress);
    const overall = this.deriveOverallStatus(tasks, now);
    const projectName = header.projectName?.trim() || `项目 ${header.id}`;

    const lines: string[] = [];
    lines.push(`# 项目分析报告`);
    lines.push(``);
    lines.push(`## 项目概览`);
    lines.push(`- **项目名称**：${projectName}（ID: ${header.id}）`);
    lines.push(`- **整体进度**：${pct}%（按任务进度百分比算术平均）`);
    lines.push(`- **当前状态**：${overall}`);
    lines.push(``);
    lines.push(`## 任务状态分布`);
    lines.push(`- 待开始：${c0}`);
    lines.push(`- 进行中：${c1}`);
    lines.push(`- 已完成：${c2}`);
    lines.push(`- 已延期：${c3}`);
    lines.push(``);

    lines.push(`## 延期风险任务`);
    if (overdueTasks.length === 0) {
      lines.push(`- 当前无「已过期未完成」任务。`);
    } else {
      for (const t of overdueTasks) {
        const due = t.dueTime ? t.dueTime.toISOString().slice(0, 10) : "未设置";
        const reason = t.taskDesc?.trim() ? t.taskDesc.trim().slice(0, 200) : "未在任务描述中说明";
        lines.push(
          `- **${t.taskName ?? `任务 ${t.id}`}**（ID ${t.id}）｜负责人 ${nameOf(t.assigneeUserId)}｜截止 ${due}｜状态 ${toTaskStatus(t.status)}｜延期说明：${reason}`,
        );
      }
    }
    lines.push(``);

    lines.push(`## 本周/下周到期任务（未来 7 天内截止，且未完成）`);
    if (dueSoonTasks.length === 0) {
      lines.push(`- 无。`);
    } else {
      for (const t of dueSoonTasks) {
        const due = t.dueTime ? t.dueTime.toISOString().slice(0, 10) : "未设置";
        lines.push(
          `- **${t.taskName ?? `任务 ${t.id}`}**（ID ${t.id}）｜${toTaskStatus(t.status)}｜进度 ${Number(t.progress ?? 0).toFixed(0)}%｜负责人 ${nameOf(t.assigneeUserId)}｜截止 ${due}｜优先级 ${toTaskPriorityLabel(t.priority)}｜风险 ${this.taskRiskLabel(t.riskLevel)}`,
        );
      }
    }
    lines.push(``);

    lines.push(`## 资源负载（未完成任务按负责人统计）`);
    if (loadByAssignee.size === 0) {
      lines.push(`- 无未完成任务。`);
    } else {
      const sorted = [...loadByAssignee.entries()].sort((a, b) => b[1] - a[1]);
      for (const [name, n] of sorted) {
        lines.push(`- ${name}：${n} 项`);
      }
      if (overloaded.length > 0) {
        lines.push(
          `- **提示**：${overloaded.map(([n, c]) => `${n}（${c} 项）`).join("、")} 未完成任务较多（≥${OVERLOAD_THRESHOLD}），建议评估分工与优先级。`,
        );
      }
    }
    lines.push(``);

    lines.push(`## 建议`);
    const tips: string[] = [];
    if (overdueTasks.length > 0) {
      tips.push(`优先消化 ${overdueTasks.length} 条已过期未完成项：与负责人确认新截止日与阻塞原因，并在任务描述中补充说明。`);
    }
    if (dueSoonTasks.length > 0) {
      tips.push(`未来 7 日内有 ${dueSoonTasks.length} 条待交付任务，建议每日同步进度并提前暴露依赖风险。`);
    }
    if (overloaded.length > 0) {
      tips.push(`关注高负载负责人，适当拆解任务或调整排期，避免单点过载。`);
    }
    if (tips.length === 0) {
      tips.push(`当前任务节奏与负载整体平稳，可继续按里程碑推进，并保持周度同步。`);
    }
    lines.push(...tips.slice(0, 2).map((t, i) => `${i + 1}. ${t}`));
    lines.push(``);
    lines.push(`---`);
    lines.push(`*报告生成时间: ${new Date().toLocaleString("zh-CN")}*`);

    return lines.join("\n");
  }
}
