import type { AuthContext } from "../../../common/types";
import { isNumericId, toTaskStatus } from "../core/ai.domain-format";
import { canManageTask } from "../core/ai.permissions";
import { getProjectReportHeader, listTasksForProjectReport, type TaskReportRow } from "./task-read.service";

export type BatchAdjustStatus = "0" | "1" | "2" | "3";

export type ParsedBatchAdjustIntent = {
  toStatus: BatchAdjustStatus | null;
  fromFilter: "all" | BatchAdjustStatus | null;
};

export type BatchAdjustPlanOk = {
  ok: true;
  projectId: string;
  projectName: string;
  toStatus: BatchAdjustStatus;
  fromFilter: "all" | BatchAdjustStatus;
  previewLines: string[];
  taskIds: string[];
  /** 用于确认弹窗展示 */
  taskNames: string[];
};

export type BatchAdjustPlan = BatchAdjustPlanOk | { ok: false; output: string };

function wordToStatus(word: string): BatchAdjustStatus | null {
  if (word === "待开始" || word === "未开始") return "0";
  if (word === "进行中") return "1";
  if (word === "已完成" || word === "完成") return "2";
  if (word === "延期") return "3";
  return null;
}

/**
 * 从自然语言中解析「批量改状态」：目标状态 + 可选来源筛选（全部 / 某状态）。
 */
export function parseBatchAdjustIntent(input: string): ParsedBatchAdjustIntent {
  const t = input.trim();
  const toMatch = t.match(
    /(?:改为|改成|设为|标记为|更新为|调成)\s*[「"']?\s*(待开始|未开始|进行中|已完成|完成|延期)\s*[」"']?/,
  );
  const toStatus = toMatch?.[1] ? wordToStatus(toMatch[1]) : null;
  const beforeTo =
    toMatch && typeof toMatch.index === "number" ? t.slice(0, toMatch.index) : t;

  const fromFilter = parseFromFilterSegment(beforeTo);
  return { toStatus, fromFilter };
}

function parseFromFilterSegment(before: string): "all" | BatchAdjustStatus | null {
  if (/(?:所有|全部)[^。]{0,50}?(?:未开始|待开始)/.test(before)) return "0";
  if (/(?:所有|全部)[^。]{0,50}?进行中/.test(before)) return "1";
  if (/(?:所有|全部)[^。]{0,50}?(?:已完成|完成)(?!任务)/.test(before)) return "2";
  if (/(?:所有|全部)[^。]{0,50}?延期/.test(before)) return "3";
  if (/全部|所有/.test(before)) return "all";

  const statusHit = before.match(/(待开始|未开始|进行中|已完成|完成|延期)/);
  if (statusHit?.[1]) {
    const c = wordToStatus(statusHit[1]);
    if (c !== null) return c;
  }
  return null;
}

function filterByFrom(
  rows: TaskReportRow[],
  from: "all" | BatchAdjustStatus,
): TaskReportRow[] {
  if (from === "all") return rows;
  return rows.filter((r) => (r.status ?? "") === from);
}

/**
 * 计算关联项目下将批量变更状态的任务列表（已做权限过滤），不写入数据库。
 */
export async function planProjectBatchStatusAdjust(
  ctx: AuthContext,
  projectIdStr: string,
  inputText: string,
): Promise<BatchAdjustPlan> {
  if (!isNumericId(projectIdStr)) {
    return {
      ok: false,
      output: "请先在助手中选择「关联项目」；批量调整仅针对该项目下的任务。",
    };
  }

  const header = await getProjectReportHeader(ctx.tenantId, projectIdStr);
  if (!header) {
    return { ok: false, output: "项目不存在或无权限访问。" };
  }

  const allRowsEarly = await listTasksForProjectReport(ctx.tenantId, projectIdStr);
  if (allRowsEarly.length === 0) {
    return { ok: false, output: "该项目下没有任务。" };
  }

  const parsed = parseBatchAdjustIntent(inputText);
  if (!parsed.toStatus) {
    return {
      ok: false,
      output:
        "请说明要改成的目标状态，例如：将所有待开始任务改为进行中。",
    };
  }

  if (parsed.fromFilter === null) {
    return {
      ok: false,
      output: "请说明要调整哪些任务，例如：所有待开始、全部、仅延期任务。",
    };
  }

  const candidates = filterByFrom(allRowsEarly, parsed.fromFilter).filter(
    (r) => (r.status ?? "") !== parsed.toStatus,
  );

  const manageable: TaskReportRow[] = [];
  for (const row of candidates) {
    const idStr = String(row.id);
    if (await canManageTask(ctx, idStr)) {
      manageable.push(row);
    }
  }

  if (manageable.length === 0) {
    return {
      ok: false,
      output: "没有可变更的任务（已全部为目标状态，或你无权限）。",
    };
  }

  const previewLines = manageable.map((row, i) => {
    const name = row.taskName?.trim() || `任务 ${row.id}`;
    const cur = toTaskStatus(row.status ?? "");
    return `${i + 1}. 「${name}」（ID: ${row.id}）当前「${cur}」→「${toTaskStatus(parsed.toStatus)}」`;
  });

  return {
    ok: true,
    projectId: projectIdStr,
    projectName: header.projectName ?? projectIdStr,
    toStatus: parsed.toStatus,
    fromFilter: parsed.fromFilter,
    previewLines,
    taskIds: manageable.map((r) => String(r.id)),
    taskNames: manageable.map((r) => r.taskName?.trim() || `任务 ${r.id}`),
  };
}
