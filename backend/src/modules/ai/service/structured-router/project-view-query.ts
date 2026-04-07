import type { Prisma } from "@prisma/client";
import { toDbId } from "../../../../common/db-values";
import { prisma } from "../../../../common/prisma";
import { buildMeta } from "../../core/ai.meta";
import { toProjectStatus } from "../../core/ai.domain-format";
import { cleanQuotedText } from "../../core/ai.text-utils";
import type { ChatTurnState } from "../../chat/chat-host";
import type { AiResponse } from "../../core/ai.types";

/**
 * 用户说「查看 xxx 项目」时，应按项目名称/编号检索项目，而不是按任务 ID。
 * 在结构化路由误返回 view_task + task_id 之前优先处理。
 */
export async function tryExecuteViewProjectByUserText(state: ChatTurnState): Promise<AiResponse | null> {
  const t = state.input.inputText.trim();
  const m = t.match(/^(?:请|帮我|麻烦|可以)?\s*查看\s*(.+?)项目\s*$/);
  if (!m?.[1]) return null;

  const raw = cleanQuotedText(m[1].trim());
  if (!raw) return null;

  const { ctx, startedAt } = state;
  const tenantId = ctx.tenantId;

  const orClause: Prisma.ProjectWhereInput[] = [
    { projectName: { contains: raw, mode: "insensitive" } },
    { projectCode: { contains: raw, mode: "insensitive" } },
  ];
  if (/^\d+$/.test(raw)) {
    orClause.push({ id: toDbId(raw) });
  }

  const rows = await prisma.project.findMany({
    where: { tenantId, delFlag: "0", OR: orClause },
    select: {
      id: true,
      projectName: true,
      projectCode: true,
      status: true,
      progress: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { id: "desc" },
    take: 12,
  });

  if (rows.length === 0) {
    return {
      success: true,
      output: `没有找到名称或编号包含「${raw}」的项目。可换关键词或通过「项目列表」入口核对名称。`,
      metadata: buildMeta(startedAt),
    };
  }

  if (rows.length === 1) {
    const p = rows[0]!;
    return {
      success: true,
      output:
        `项目详情：\n` +
        `  - ID: ${p.id}\n` +
        `  - 名称: ${p.projectName}\n` +
        `  - 编号: ${p.projectCode ?? "无"}\n` +
        `  - 状态: ${toProjectStatus(p.status)}\n` +
        `  - 进度: ${Number(p.progress ?? 0).toFixed(0)}%\n` +
        `  - 计划开始: ${p.startTime?.toISOString().slice(0, 10) ?? "未设置"}\n` +
        `  - 计划结束: ${p.endTime?.toISOString().slice(0, 10) ?? "未设置"}`,
      metadata: buildMeta(startedAt),
    };
  }

  const lines = rows
    .slice(0, 10)
    .map((p, i) => `${i + 1}. ${p.projectName}（ID: ${p.id}，${toProjectStatus(p.status)}）`)
    .join("\n");
  return {
    success: true,
    output: `找到多个可能匹配的项目，请说得更具体一点，或带上完整项目名：\n${lines}`,
    metadata: buildMeta(startedAt),
  };
}
