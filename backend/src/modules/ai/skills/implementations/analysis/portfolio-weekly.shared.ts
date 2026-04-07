import type { ProjectReportHeader, TaskReportRow } from "../../../services/task-read.service";

/** 用户明确要求覆盖租户内多个项目时的周报（与单项目 bizId 无关） */
export function wantsAllProjectsWeekly(input: string): boolean {
  return /所有项目|全部项目|各项目|跨项目|全租户|租户内全部|全项目周报/.test(input.trim());
}

export type IsoWeekRange = { startStr: string; endStr: string; label: string };

/** 当前日期所在自然周（周一至周日），日期串为本地日历日 */
export function getIsoWeekRange(now: Date = new Date()): IsoWeekRange {
  const d = new Date(now);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dayN = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${dayN}`;
  };
  const startStr = fmt(monday);
  const endStr = fmt(sunday);
  return { startStr, endStr, label: `${startStr} 至 ${endStr}` };
}

export function weekTimeWindow(week: IsoWeekRange): { ws: Date; we: Date } {
  const ws = new Date(week.startStr + "T00:00:00");
  const we = new Date(week.endStr + "T23:59:59");
  return { ws, we };
}

/** 截止日落在本周（含首尾日） */
export function isTaskDueInWeek(t: TaskReportRow, ws: Date, we: Date): boolean {
  if (!t.dueTime) return false;
  return t.dueTime >= ws && t.dueTime <= we;
}

/**
 * 推断「本周完成」：finishTime 落在本周；否则 updateTime 落在本周；若均无，则「已完成且截止日在本周」视为本周相关完成项（兼容未写完成时间的旧数据）。
 */
export function isTaskCompletedThisWeek(t: TaskReportRow, ws: Date, we: Date): boolean {
  if (t.status !== "2") return false;
  if (t.finishTime) {
    return t.finishTime >= ws && t.finishTime <= we;
  }
  if (t.updateTime) {
    return t.updateTime >= ws && t.updateTime <= we;
  }
  return isTaskDueInWeek(t, ws, we);
}

export type PortfolioBundle = { header: ProjectReportHeader; tasks: TaskReportRow[] };

/**
 * 简洁全项目周报：仅包含有「本周到期」或「本周完成」任务的项目；不输出全零统计段落。
 */
export function buildConcisePortfolioWeeklyMarkdown(week: IsoWeekRange, bundles: PortfolioBundle[]): string {
  const { ws, we } = weekTimeWindow(week);
  const blocks: string[] = [];
  let totalCompletedWeek = 0;
  let totalDueWeek = 0;

  for (const { header, tasks } of bundles) {
    const dueInWeek = tasks.filter((t) => isTaskDueInWeek(t, ws, we));
    const completedWeek = tasks.filter((t) => isTaskCompletedThisWeek(t, ws, we));
    if (dueInWeek.length === 0 && completedWeek.length === 0) continue;

    totalDueWeek += dueInWeek.length;
    totalCompletedWeek += completedWeek.length;

    const name = header.projectName?.trim() || "未命名项目";
    const pct = Number(header.progress ?? 0).toFixed(0);
    blocks.push(
      `**${name}（进度 ${pct}%）**\n本周完成：${completedWeek.length} 个任务\n本周到期：${dueInWeek.length} 个任务`,
    );
  }

  const head = [`# 全项目周报`, ``, `**本周**：${week.label}`, ``];

  if (blocks.length === 0) {
    return [
      ...head,
      `本周各项目无截止日在本周的任务，也无在本周完成标记的任务。`,
      ``,
      `共完成 0 个任务，0 个任务即将到期。`,
    ].join("\n");
  }

  return [...head, blocks.join("\n\n"), ``, `共完成 ${totalCompletedWeek} 个任务，${totalDueWeek} 个任务即将到期。`].join("\n");
}

export function buildNextWeekBulletsFromTasks(rows: TaskReportRow[]): string[] {
  const out: string[] = [];
  const delayed = rows.filter((t) => t.status === "3");
  const highRisk = rows.filter((t) => ["2", "3"].includes(t.riskLevel ?? "0"));
  const inProgress = rows.filter((t) => t.status === "1");
  if (delayed.length) {
    out.push(`消化 ${delayed.length} 条延期任务：与责任人确认新的目标完成日，并记录阻塞原因。`);
  }
  if (highRisk.length) {
    out.push(`对 ${highRisk.length} 条中高风险任务做逐条复盘，必要时下调范围或增加资源。`);
  }
  if (inProgress.length) {
    out.push(`跟进 ${inProgress.length} 条进行中任务的进度与依赖，避免临近截止才暴露风险。`);
  }
  const soon = rows.filter((t) => {
    if (!t.dueTime || t.status === "2") return false;
    const days = Math.ceil((t.dueTime.getTime() - Date.now()) / (86400 * 1000));
    return days >= 0 && days <= 7;
  });
  if (soon.length) {
    out.push(`未来 7 日内到期的任务共 ${soon.length} 条，建议排入下周计划并每日对齐。`);
  }
  if (out.length === 0) {
    out.push("结合里程碑检查下一阶段交付物，提前拆解任务并同步干系人。");
  }
  return out.slice(0, 8);
}
