import { Prisma } from "@prisma/client";
import { z } from "zod";

export const idSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value))
  .refine((value) => /^\d+$/.test(value), "ID must be a positive integer string")
  .refine((value) => BigInt(value) > 0n, "ID must be greater than zero");

export const optionalIdSchema = idSchema.optional();

export const toDbId = (value: string | number | bigint) => BigInt(String(value));

export const fromDbId = (value: string | number | bigint | null | undefined) =>
  value == null ? undefined : String(value);

export const fromDbDecimal = (value: Prisma.Decimal | string | number | bigint | null | undefined) =>
  value == null ? undefined : Number(value);
