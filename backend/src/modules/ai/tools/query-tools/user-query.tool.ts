import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../common/prisma';
import { toDbId } from '../../../../common/db-values';
import type { EnhancedContext } from '../../skills/skill.types';

/**
 * 用户查询工具输入参数
 */
const userQuerySchema = z.object({
  userId: z.string().optional().describe('用户ID，可选'),
  userName: z.string().optional().describe('用户名称关键词，可选'),
  deptId: z.string().optional().describe('部门ID，可选'),
  limit: z.number().optional().default(20).describe('返回结果数量限制'),
});

type UserQueryInput = z.infer<typeof userQuerySchema>;

/**
 * 用户查询工具
 * 用于查询用户信息，支持按用户ID、名称、部门等条件查询
 */
export class UserQueryTool extends StructuredTool {
  name = 'user_query';
  description = '查询用户信息，支持按用户ID、名称、部门等条件查询。';
  schema = userQuerySchema;

  constructor() {
    super();
  }

  async _call(input: UserQueryInput, context: EnhancedContext): Promise<string> {
    const { userId, userName, deptId, limit } = input;
    const { tenantId } = context;

    // 构建查询条件
    const where: any = {
      tenantId,
      delFlag: '0',
    };

    if (userId) {
      where.userId = toDbId(userId);
    }

    if (userName) {
      where.nickName = {
        contains: userName,
      };
    }

    if (deptId) {
      where.deptId = toDbId(deptId);
    }

    // 查询用户
    const users = await prisma.user.findMany({
      where,
      select: {
        userId: true,
        nickName: true,
        deptId: true,
        email: true,
        phonenumber: true,
        status: true,
      },
      orderBy: { userId: 'desc' },
      take: limit,
    });

    if (users.length === 0) {
      return '未找到匹配的用户。';
    }

    // 查询部门信息
    const deptIds = users.map(u => u.deptId).filter(Boolean);
    let departments: Map<bigint, string> = new Map();

    if (deptIds.length > 0) {
      const depts = await prisma.dept.findMany({
        where: {
          tenantId,
          deptId: { in: deptIds },
          delFlag: '0',
        },
        select: { deptId: true, deptName: true },
      });
      depts.forEach(dept => {
        departments.set(dept.deptId, dept.deptName || '未知部门');
      });
    }

    // 格式化输出
    const formattedUsers = users.map(user => {
      const deptName = user.deptId ? departments.get(user.deptId) || `部门ID: ${user.deptId}` : '未分配部门';
      const status = user.status === '0' ? '正常' : '禁用';

      return `- 用户ID: ${user.userId}
  昵称: ${user.nickName}
  部门: ${deptName}
  邮箱: ${user.email || '未设置'}
  电话: ${user.phonenumber || '未设置'}
  状态: ${status}`;
    }).join('\n\n');

    return `找到 ${users.length} 个用户：\n\n${formattedUsers}`;
  }
}

// 工具实例工厂函数
export function createUserQueryTool() {
  return new UserQueryTool();
}