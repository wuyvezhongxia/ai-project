import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const ok = <T>(res: Response, data: T, message = "ok", statusCode = 200) =>
  res.status(statusCode).json({
    code: 0,
    message,
    data,
  });

export const asyncHandler =
  (handler: (req: any, res: Response, next: NextFunction) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req, res, next)).catch(next);

export const parseBody = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("Request body validation failed", 400, result.error.flatten());
  }

  return result.data;
};

export const parseQuery = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("Request query validation failed", 400, result.error.flatten());
  }

  return result.data;
};

export const parseParams = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("Request params validation failed", 400, result.error.flatten());
  }

  return result.data;
};
