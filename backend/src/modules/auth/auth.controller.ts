import type { Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { ok } from "../../common/http";
import type { AuthedRequest } from "../../common/types";

export const getContext = (req: AuthedRequest, res: Response) => {
  ok(res, req.ctx);
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
