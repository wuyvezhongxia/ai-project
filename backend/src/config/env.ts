import dotenv from "dotenv";
import { z } from "zod";

// 1. 加载环境变量
dotenv.config();

// 2. 定义环境变量的校验 schema
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * 默认 `sub_pm`：与历史本地开发一致，避免无 .env 时误连空库导致「数据全没了」。
   * 新建独立环境可改用 `ai_project_pm` 等，在 .env 中覆盖即可；勿把生产/父项目连接串提交入库。
   */
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:123456@localhost:5432/sub_pm"),
  JWT_SECRET: z.string().min(1).default("pm-module-secret"),
  ALLOW_DEV_AUTH_BYPASS: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  /**
   * 可选：逗号分隔子串；DATABASE_URL 包含任一则拒绝启动（禁止误连父项目库主机名、库名等）。
   * 例：parent.db.internal,sub_pm_prod
   */
  DATABASE_URL_BLOCKED_SUBSTRINGS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  /**
   * 团队负载：每人每周「有效产能」人时数（可把 40h×效率系数 写在这里，默认 32≈0.8×40）。
   */
  WORKLOAD_CAPACITY_HOURS_PER_USER_WEEK: z.coerce.number().positive().default(32),
  /** 任务 priority 未识别时，用于估算剩余工时的默认人时/条 */
  WORKLOAD_DEFAULT_HOURS_PER_TASK: z.coerce.number().positive().default(8),
  /** workload?range=month 时按几周折算产能（粗略） */
  WORKLOAD_MONTH_WEEKS: z.coerce.number().positive().default(4),

  // DeepSeek AI配置
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),

  // AI功能开关
  AI_FEATURE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),

  /** AI请求最大token数 */
  AI_MAX_TOKENS_PER_REQUEST: z.coerce.number().positive().default(2000),

  /** AI请求超时时间（毫秒） */
  AI_REQUEST_TIMEOUT: z.coerce.number().positive().default(30000),
});

// 3. 校验环境变量并导出为强类型对象
const parsed = envSchema.parse(process.env);

for (const needle of parsed.DATABASE_URL_BLOCKED_SUBSTRINGS) {
  if (parsed.DATABASE_URL.includes(needle)) {
    throw new Error(
      `[env] DATABASE_URL 包含被禁止的片段 "${needle}"，拒绝启动。请使用本仓库独立数据库，勿指向父项目或共用生产库。`,
    );
  }
}

export const env = parsed;

process.env.PORT = String(env.PORT);
process.env.NODE_ENV = env.NODE_ENV;
process.env.DATABASE_URL = env.DATABASE_URL;
process.env.JWT_SECRET = env.JWT_SECRET;
process.env.ALLOW_DEV_AUTH_BYPASS = env.ALLOW_DEV_AUTH_BYPASS ? "true" : "false";
