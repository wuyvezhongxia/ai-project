import type { Response } from "express";

import { db } from "../../common/data-store";
import { AppError, ok, parseParams, parseQuery } from "../../common/http";
import type { AuthedRequest } from "../../common/types";
import { z } from "zod";

const userQuerySchema = z.object({
  keyword: z.string().optional(),
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const getUserOptions = (req: AuthedRequest, res: Response) => {
  const query = parseQuery(userQuerySchema, req.query);

  const users = db.users.filter((item) => {
    if (item.tenantId !== req.ctx.tenantId || item.status !== "0" || item.delFlag !== "0") {
      return false;
    }

    if (!query.keyword) {
      return true;
    }

    return item.nickName.includes(query.keyword) || item.userName.includes(query.keyword);
  });

  ok(
    res,
    users.map((item) => ({
      userId: item.userId,
      userName: item.userName,
      nickName: item.nickName,
      deptId: item.deptId,
    })),
  );
};

export const getDeptTree = (req: AuthedRequest, res: Response) => {
  const tenantDepts = db.depts.filter((item) => item.tenantId === req.ctx.tenantId);
  const result = tenantDepts.map((dept) => ({
    ...dept,
    children: tenantDepts.filter((child) => child.parentId === dept.deptId),
  }));

  ok(res, result.filter((item) => item.parentId === null));
};

export const getUserDetail = (req: AuthedRequest, res: Response) => {
  const params = parseParams(idParamsSchema, req.params);
  const user = db.users.find(
    (item) => item.userId === params.id && item.tenantId === req.ctx.tenantId && item.delFlag === "0",
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  ok(res, user);
};

export const getCurrentTenant = (req: AuthedRequest, res: Response) => {
  const tenant = db.tenants.find((item) => item.tenantId === req.ctx.tenantId);
  if (!tenant) {
    throw new AppError("Tenant not found", 404);
  }

  ok(res, tenant);
};
