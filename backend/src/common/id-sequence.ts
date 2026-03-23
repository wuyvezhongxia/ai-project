import { prisma } from "./prisma";

export async function nextId(schema: "public" | "rz_ai", table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ next_id: bigint }>>(
    `select coalesce(max(id), 0) + 1 as next_id from "${schema}"."${table}"`,
  );

  return rows[0]?.next_id ?? 1n;
}
