import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projectAccentColors = ["#6a83ff", "#20d6a7", "#9b7bff", "#ff8f6b", "#f6c54f", "#37c3ff"];

const hashString = (value: string) =>
  Array.from(value).reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7);

const pickStableProjectAccentColor = (seed: string) =>
  projectAccentColors[Math.abs(hashString(seed)) % projectAccentColors.length];

async function main() {
  const projects = await prisma.project.findMany({
    where: { delFlag: "0" },
    select: {
      id: true,
      tenantId: true,
      createBy: true,
    },
    orderBy: { id: "asc" },
  });

  const styles = await prisma.projectStyle.findMany({
    select: {
      id: true,
      tenantId: true,
      projectId: true,
      accentColor: true,
      delFlag: true,
    },
  });

  const styleMap = new Map(styles.map((item) => [`${item.tenantId}:${item.projectId.toString()}`, item]));

  let createdCount = 0;
  let restoredCount = 0;
  let skippedCount = 0;

  for (const project of projects) {
    const key = `${project.tenantId}:${project.id.toString()}`;
    const existing = styleMap.get(key);
    const accentColor = pickStableProjectAccentColor(project.id.toString());
    const timestamp = new Date();

    if (!existing) {
      await prisma.projectStyle.create({
        data: {
          tenantId: project.tenantId,
          projectId: project.id,
          accentColor,
          createBy: project.createBy,
          createTime: timestamp,
          delFlag: "0",
        },
      });
      createdCount += 1;
      continue;
    }

    if (existing.delFlag === "0" && existing.accentColor) {
      skippedCount += 1;
      continue;
    }

    await prisma.projectStyle.update({
      where: { id: existing.id },
      data: {
        accentColor,
        delFlag: "0",
        updateBy: project.createBy,
        updateTime: timestamp,
      },
    });
    restoredCount += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Project style backfill complete: created=${createdCount}, restored=${restoredCount}, skipped=${skippedCount}, total=${projects.length}`,
  );
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Project style backfill failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
