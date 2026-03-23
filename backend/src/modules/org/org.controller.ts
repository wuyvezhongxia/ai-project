import type { Response } from "express";
import { z } from "zod";

import { toDbId } from "../../common/db-values";
import { toDeptProfile, toTenantProfile, toUserProfile } from "../../common/db-mappers";
import { prisma } from "../../common/prisma";
import { AppError, ok, parseParams, parseQuery } from "../../common/http";
import type { AuthedRequest } from "../../common/types";

const userQuerySchema = z.object({
  keyword: z.string().optional(),
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const getUserOptions = async (req: AuthedRequest, res: Response) => {
  const query = parseQuery(userQuerySchema, req.query);

  const rows = await prisma.user.findMany({
    where: {
      tenantId: req.ctx.tenantId,
      status: "0",
      delFlag: "0",
      ...(query.keyword
        ? {
            OR: [
              { nickName: { contains: query.keyword } },
              { userName: { contains: query.keyword } },
            ],
          }
        : {}),
    },
    orderBy: { userId: "asc" },
  });

  ok(
    res,
    rows.map((item) => ({
      userId: String(item.userId),
      userName: item.userName,
      nickName: item.nickName,
      deptId: item.deptId == null ? undefined : String(item.deptId),
    })),
  );
};

export const getDeptTree = async (req: AuthedRequest, res: Response) => {
  const tenantDepts = await prisma.dept.findMany({
    where: { tenantId: req.ctx.tenantId },
    orderBy: { deptId: "asc" },
  });
  const mapped = tenantDepts.map(toDeptProfile);
  const result = mapped.map((dept) => ({
    ...dept,
    children: mapped.filter((child) => child.parentId === dept.deptId),
  }));

  ok(res, result.filter((item) => item.parentId === null));
};

export const getUserDetail = async (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const row = await prisma.user.findFirst({
    where: { userId: toDbId(params.id), tenantId: req.ctx.tenantId, delFlag: "0" },
  });

  if (!row) {
    throw new AppError("User not found", 404);
  }

  ok(res, toUserProfile(row));
};

export const getCurrentTenant = async (req: AuthedRequest, res: Response) => {
  const row = await prisma.tenant.findFirst({ where: { tenantId: req.ctx.tenantId } });
  if (!row) {
    throw new AppError("Tenant not found", 404);
  }

  ok(res, toTenantProfile(row));
};
