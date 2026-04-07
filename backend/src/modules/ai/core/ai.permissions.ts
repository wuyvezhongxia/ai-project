import { toDbId } from "../../../common/db-values";
import { prisma } from "../../../common/prisma";
import type { AuthContext } from "../../../common/types";

export const canManageTask = async (ctx: AuthContext, taskId: string) => {
  if (ctx.roleIds.includes("1")) return true;
  const id = toDbId(taskId);
  const currentUserId = toDbId(ctx.userId);
  const task = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantId, id },
    select: { assigneeUserId: true, creatorUserId: true, createBy: true },
  });
  if (!task) return false;
  if (task.assigneeUserId === currentUserId || task.creatorUserId === currentUserId || task.createBy === currentUserId) {
    return true;
  }
  const collaborator = await prisma.taskCollaborator.findFirst({
    where: {
      tenantId: ctx.tenantId,
      taskId: id,
      userId: currentUserId,
      delFlag: "0",
    },
  });
  return Boolean(collaborator);
};
