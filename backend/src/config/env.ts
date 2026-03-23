import dotenv from "dotenv";
import { z } from "zod";

// 1. 加载环境变量
dotenv.config();

// 2. 定义环境变量的校验 schema
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** PostgreSQL connection string, e.g. postgresql://USER:PASSWORD@localhost:5432/DB_NAME */
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:123456@localhost:5432/sub_pm"),
  JWT_SECRET: z.string().min(1).default("pm-module-secret"),
  ALLOW_DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

// 3. 校验环境变量并导出为强类型对象
export const env = envSchema.parse(process.env);

process.env.PORT = String(env.PORT);
process.env.NODE_ENV = env.NODE_ENV;
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.JWT_SECRET = env.JWT_SECRET;
process.env.ALLOW_DEV_AUTH_BYPASS = env.ALLOW_DEV_AUTH_BYPASS ? "true" : "false";
