import type { Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { toDbId } from "../../common/db-values";
import { ok } from "../../common/http";
import type { AuthedRequest } from "../../common/types";

import { loadRoleNamesForUser } from "./auth.service";

export const getContext = async (req: AuthedRequest, res: Response) => {
  const roleNames = await loadRoleNamesForUser(toDbId(req.ctx.userId), req.ctx.tenantId);
  ok(res, { ...req.ctx, roleNames });
};

export const checkToken = (req: AuthedRequest, res: Response) => {
  let expiredAt: string | null = null;

  if (req.token) {
    const decoded = jwt.decode(req.token) as { exp?: number } | null;
    if (decoded?.exp) {
      expiredAt = new Date(decoded.exp * 1000).toISOString();
    }
  }

  ok(res, {
    valid: true,
    mode: env.NODE_ENV !== "production" && env.ALLOW_DEV_AUTH_BYPASS && !req.token ? "dev-bypass" : "token",
    expiredAt,
  });
};
