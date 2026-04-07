import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";
import { cleanQuotedText } from "../core/ai.text-utils";
import type { CreateTaskDraft } from "../core/ai.types";

export async function resolveProjectForTask(
  ctx: AuthContext,
  inputBizId?: string,
  projectName?: string,
): Promise<{ id: bigint; projectName: string } | null> {
  if (inputBizId && /^\d+$/.test(inputBizId)) {
    const byId = await prisma.project.findFirst({
      where: { tenantId: ctx.tenantId, id: toDbId(inputBizId), delFlag: "0" },
      select: { id: true, projectName: true },
    });
    if (byId) return { id: byId.id, projectName: byId.projectName ?? String(inputBizId) };
  }

  const normalized = cleanQuotedText(projectName ?? "");
  if (!normalized) return null;

  const exact = await prisma.project.findFirst({
    where: { tenantId: ctx.tenantId, delFlag: "0", projectName: normalized },
    orderBy: { id: "desc" },
    select: { id: true, projectName: true },
  });
  if (exact) return { id: exact.id, projectName: exact.projectName ?? normalized };

  const loose = await prisma.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      delFlag: "0",
      projectName: { contains: normalized, mode: "insensitive" },
    },
    orderBy: { id: "desc" },
    select: { id: true, projectName: true },
  });
  if (loose) return { id: loose.id, projectName: loose.projectName ?? normalized };

  return null;
}

export async function createTaskFromDraftOp(
  ctx: AuthContext,
  inputBizId: string | undefined,
  draft: Pick<CreateTaskDraft, "title" | "projectName">,
  dueAt?: Date,
): Promise<{ id: string; taskName: string; projectId: string | null; projectName: string | null; status: string | null }> {
  const project = await resolveProjectForTask(ctx, inputBizId, draft.projectName);
  const requestedProjectName = cleanQuotedText(draft.projectName ?? "");
  const requestedProjectId = typeof inputBizId === "string" && /^\d+$/.test(inputBizId) ? inputBizId : "";
  if ((requestedProjectName || requestedProjectId) && !project) {
    throw new Error(
      requestedProjectName
        ? `未找到项目「${requestedProjectName}」，已阻止创建任务`
        : `未找到关联项目（ID: ${requestedProjectId}），已阻止创建任务`,
    );
  }
  const projectId = project?.id ?? null;

  const created = await prisma.task.create({
    data: {
      tenantId: ctx.tenantId,
      projectId,
      taskName: draft.title,
      taskDesc: null,
      assigneeUserId: toDbId(ctx.userId),
      assigneeDeptId: ctx.deptId ? toDbId(ctx.deptId) : null,
      creatorUserId: toDbId(ctx.userId),
      status: "0",
      priority: "1",
      progress: "0",
      startTime: null,
      dueTime: dueAt ?? null,
      finishTime: null,
      riskLevel: "0",
      parentTaskId: null,
      createDept: ctx.deptId ? toDbId(ctx.deptId) : null,
      createBy: toDbId(ctx.userId),
      createTime: new Date(),
      delFlag: "0",
    },
    select: { id: true, taskName: true, projectId: true, status: true },
  });

  await prisma.task.update({
    where: { id: created.id },
    data: { taskNo: `TASK-${String(created.id)}` },
  });

  const verified = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id: created.id, delFlag: "0" },
    select: { id: true },
  });
  if (!verified) {
    throw new Error("任务创建回查失败，未在数据库中找到新记录");
  }

  return {
    id: String(created.id),
    taskName: created.taskName ?? "",
    projectId: created.projectId ? String(created.projectId) : null,
    projectName: project?.projectName ?? null,
    status: created.status,
  };
}

export async function createProjectByNameOp(
  ctx: AuthContext,
  projectName: string,
): Promise<{ id: string; projectName: string; status: string | null; progress: string | null; existed: boolean }> {
  const duplicated = await prisma.project.findFirst({
    where: { tenantId: ctx.tenantId, projectName, delFlag: "0" },
    select: { id: true, projectName: true, status: true, progress: true },
  });
  if (duplicated) {
    return {
      id: String(duplicated.id),
      projectName: duplicated.projectName ?? projectName,
      status: duplicated.status,
      progress: duplicated.progress == null ? null : String(duplicated.progress),
      existed: true,
    };
  }

  const ts = Date.now();
  const code = `PRJ-${String(ts).slice(-6)}`;
  const created = await prisma.project.create({
    data: {
      tenantId: ctx.tenantId,
      projectCode: code,
      projectName,
      projectDesc: null,
      ownerUserId: toDbId(ctx.userId),
      ownerDeptId: ctx.deptId ? toDbId(ctx.deptId) : null,
      status: "0",
      priority: "1",
      startTime: new Date(),
      endTime: null,
      progress: "0",
      visibility: "0",
      createDept: ctx.deptId ? toDbId(ctx.deptId) : null,
      createBy: toDbId(ctx.userId),
      createTime: new Date(),
      delFlag: "0",
    },
    select: { id: true, projectName: true, status: true, progress: true },
  });

  const verified = await prisma.project.findFirst({
    where: { tenantId: ctx.tenantId, id: created.id, delFlag: "0" },
    select: { id: true },
  });
  if (!verified) {
    throw new Error("项目创建回查失败，未在数据库中找到新记录");
  }

  return {
    id: String(created.id),
    projectName: created.projectName ?? projectName,
    status: created.status,
    progress: created.progress == null ? null : String(created.progress),
    existed: false,
  };
}
