import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetSequences() {
  const tables: [string, string][] = [
    ["depts", "dept_id"],
    ["users", "user_id"],
    ["projects", "id"],
    ["project_members", "id"],
    ["tasks", "id"],
    ["task_collaborators", "id"],
    ["subtasks", "id"],
    ["task_comments", "id"],
    ["attachments", "id"],
    ["task_attachment_rels", "id"],
    ["tags", "id"],
    ["task_tag_rels", "id"],
    ["project_tag_rels", "id"],
    ["task_relations", "id"],
    ["task_activities", "id"],
    ["task_favorites", "id"],
    ["ai_records", "id"],
  ];

  for (const [table, col] of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), COALESCE((SELECT MAX("${col}") FROM "${table}"), 1))`,
    );
  }
}

async function main() {
  await prisma.tenant.upsert({
    where: { tenantId: "t_001" },
    create: {
      tenantId: "t_001",
      companyName: "示例科技",
      status: "0",
      expireTime: new Date("2099-12-31T23:59:59.000Z"),
      llmId: 1,
    },
    update: {
      companyName: "示例科技",
      status: "0",
      expireTime: new Date("2099-12-31T23:59:59.000Z"),
      llmId: 1,
    },
  });

  await prisma.dept.upsert({
    where: { deptId: 2001 },
    create: { deptId: 2001, tenantId: "t_001", parentId: null, deptName: "产品部", leader: 1001 },
    update: { deptName: "产品部", leader: 1001 },
  });
  await prisma.dept.upsert({
    where: { deptId: 2002 },
    create: { deptId: 2002, tenantId: "t_001", parentId: null, deptName: "研发部", leader: 1002 },
    update: { deptName: "研发部", leader: 1002 },
  });

  const users = [
    { userId: 1001, userName: "zhangsan", nickName: "张三", deptId: 2001 },
    { userId: 1002, userName: "lisi", nickName: "李四", deptId: 2001 },
    { userId: 1003, userName: "wangwu", nickName: "王五", deptId: 2002 },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { userId: u.userId },
      create: {
        userId: u.userId,
        tenantId: "t_001",
        deptId: u.deptId,
        userName: u.userName,
        nickName: u.nickName,
        status: "0",
        delFlag: "0",
      },
      update: {
        deptId: u.deptId,
        userName: u.userName,
        nickName: u.nickName,
        status: "0",
        delFlag: "0",
      },
    });
  }

  const t = new Date().toISOString();
  await prisma.tag.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      tenantId: "t_001",
      tagName: "高优先级",
      tagColor: "#f5222d",
      tagType: "task",
      createBy: 1001,
      createTime: new Date(t),
      delFlag: "0",
    },
    update: { tagName: "高优先级", tagColor: "#f5222d", tagType: "task", delFlag: "0" },
  });
  await prisma.tag.upsert({
    where: { id: 2 },
    create: {
      id: 2,
      tenantId: "t_001",
      tagName: "核心项目",
      tagColor: "#1677ff",
      tagType: "project",
      createBy: 1001,
      createTime: new Date(t),
      delFlag: "0",
    },
    update: { tagName: "核心项目", tagColor: "#1677ff", tagType: "project", delFlag: "0" },
  });

  await resetSequences();
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Seed finished");
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
