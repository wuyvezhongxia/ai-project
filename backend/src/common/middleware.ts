import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { toDbId } from "./db-values";
import { env } from "../config/env";
import { AppError } from "./http";
import { prisma } from "./prisma";
import type { AuthContext } from "./types";

type JwtPayload = {
  user_id: number | string;
  tenant_id: string;
  dept_id?: number | string;
  user_name?: string;
  nick_name?: string;
  role_ids?: Array<number | string>;
  exp?: number;
};

const buildDevContext = (): AuthContext => ({
  userId: "1",
  tenantId: "000000",
  deptId: "103",
  userName: "admin",
  nickName: "软筑科技",
  roleIds: ["1"],
});

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.header("authorization");

  if (!authHeader) {
    if (env.NODE_ENV !== "production" && env.ALLOW_DEV_AUTH_BYPASS) {
      (req as Request & { ctx: AuthContext }).ctx = buildDevContext();
      return next();
    }

    return next(new AppError("Missing Authorization header", 401));
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return next(new AppError("Invalid Authorization header", 401));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const ctx: AuthContext = {
      userId: String(payload.user_id),
      tenantId: payload.tenant_id,
      deptId: payload.dept_id == null ? undefined : String(payload.dept_id),
      userName: payload.user_name,
      nickName: payload.nick_name,
      roleIds: (payload.role_ids ?? []).map(String),
    };

    const tenant = await prisma.tenant.findFirst({ where: { tenantId: ctx.tenantId } });
    if (!tenant || tenant.status !== "0") {
      return next(new AppError("Tenant is not available", 403));
    }

    const user = await prisma.user.findFirst({
      where: { userId: toDbId(ctx.userId), tenantId: ctx.tenantId, status: "0", delFlag: "0" },
    });
    if (!user) {
      return next(new AppError("User is not available", 403));
    }

    (req as Request & { ctx: AuthContext; token?: string }).ctx = ctx;
    (req as Request & { ctx: AuthContext; token?: string }).token = token;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("Token verification failed", 401));
  }
};

export const notFoundMiddleware = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError("Route not found", 404));
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.statusCode,
      message: error.message,
      details: error.details,
    });
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return res.status(500).json({
    code: 500,
    message,
  });
};
