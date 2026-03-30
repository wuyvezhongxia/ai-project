/**
 * 补全 public.pm_subtask 与当前业务一致的结构（幂等）：
 * 1) 缺失列：priority、planned_*、finish_time
 * 2) status 检查约束：库内若仅有 0/1，选「已取消」会写 status='2' 并软删，需允许 '2'
 *
 * 使用（backend 目录，需 .env 中 DATABASE_URL）：
 *   pnpm run db:ensure-subtask-columns
 *
 * 不执行全库 db push，避免与其它表漂移冲突。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ddl = [
  `ALTER TABLE public.pm_subtask ADD COLUMN IF NOT EXISTS priority CHAR(1) NOT NULL DEFAULT '1'`,
  `ALTER TABLE public.pm_subtask ADD COLUMN IF NOT EXISTS planned_start_time TIMESTAMP(6)`,
  `ALTER TABLE public.pm_subtask ADD COLUMN IF NOT EXISTS planned_due_time TIMESTAMP(6)`,
  `ALTER TABLE public.pm_subtask ADD COLUMN IF NOT EXISTS finish_time TIMESTAMP(6)`,
];

/** 历史库常见仅允许待处理/已完成；已取消 = status '2' + del_flag 软删，需放宽 CHECK */
const statusCheckDdl = [
  `ALTER TABLE public.pm_subtask DROP CONSTRAINT IF EXISTS ck_public_pm_subtask_status`,
  `ALTER TABLE public.pm_subtask DROP CONSTRAINT IF EXISTS pm_subtask_status_check`,
  `ALTER TABLE public.pm_subtask ADD CONSTRAINT ck_public_pm_subtask_status CHECK (status IN ('0', '1', '2'))`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("缺少 DATABASE_URL，请在 backend/.env 中配置。");
  }

  const masked = url.replace(/:([^:@]+)@/, ":****@");
  // eslint-disable-next-line no-console
  console.log("目标库（密码已打码）:", masked);

  const before = await prisma.$queryRaw<
    { column_name: string }[]
  >`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pm_subtask' ORDER BY ordinal_position`;
  // eslint-disable-next-line no-console
  console.log("执行前列:", before.map((r) => r.column_name).join(", "));

  for (const sql of ddl) {
    await prisma.$executeRawUnsafe(sql);
    // eslint-disable-next-line no-console
    console.log("OK:", sql.slice(0, 72) + (sql.length > 72 ? "…" : ""));
  }

  const after = await prisma.$queryRaw<
    { column_name: string }[]
  >`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pm_subtask' ORDER BY ordinal_position`;
  // eslint-disable-next-line no-console
  console.log("执行后列:", after.map((r) => r.column_name).join(", "));

  // eslint-disable-next-line no-console
  console.log("--- 放宽 status CHECK（允许已取消 = 2）---");
  for (const sql of statusCheckDdl) {
    await prisma.$executeRawUnsafe(sql);
    // eslint-disable-next-line no-console
    console.log("OK:", sql.slice(0, 80) + (sql.length > 80 ? "…" : ""));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
