import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../common/prisma';
import { toDbId } from '../../../../common/db-values';
import type { EnhancedContext } from '../../skills/skill.types';

/**
 * 项目查询工具输入参数
 */
const projectQuerySchema = z.object({
  projectId: z.string().optional().describe('项目ID，可选'),
  projectName: z.string().optional().describe('项目名称关键词，可选'),
  limit: z.number().optional().default(10).describe('返回结果数量限制'),
});

type ProjectQueryInput = z.infer<typeof projectQuerySchema>;

/**
 * 项目查询工具
 * 用于查询项目信息，支持按ID或名称关键词查询
 */
export class ProjectQueryTool extends StructuredTool {
  name = 'project_query';
  description = '查询项目信息，支持按项目ID或名称关键词查询。';
  schema = projectQuerySchema;

  constructor() {
    super();
  }

  async _call(input: ProjectQueryInput, context: EnhancedContext): Promise<string> {
    const { projectId, projectName, limit } = input;
    const { tenantId, userId } = context;

    // 构建查询条件
    const where: any = {
      tenantId,
      delFlag: '0',
    };

    if (projectId) {
      where.id = toDbId(projectId);
    }

    if (projectName) {
      where.projectName = {
        contains: projectName,
      };
    }

    // 权限检查：用户必须是项目成员或负责人
    // 这里简化处理，实际项目中可能需要更复杂的权限验证
    const userProjects = await prisma.projectMember.findMany({
      where: {
        tenantId,
        userId: toDbId(userId),
        delFlag: '0',
      },
      select: { projectId: true },
    });

    const ownedProjects = await prisma.project.findMany({
      where: {
        tenantId,
        ownerUserId: toDbId(userId),
        delFlag: '0',
      },
      select: { id: true },
    });

    const accessibleProjectIds = [
      ...userProjects.map(p => p.projectId),
      ...ownedProjects.map(p => p.id),
    ];

    if (accessibleProjectIds.length === 0) {
      return '您没有可访问的项目。';
    }

    // 如果指定了projectId，检查是否有权限访问
    if (projectId && !accessibleProjectIds.includes(toDbId(projectId))) {
      return `您没有权限访问项目 ${projectId}。`;
    }

    // 如果没有指定projectId，只返回用户可访问的项目
    if (!projectId) {
      where.id = { in: accessibleProjectIds };
    }

    // 查询项目
    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        projectName: true,
        status: true,
        progress: true,
        startTime: true,
        endTime: true,
        ownerUserId: true,
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    if (projects.length === 0) {
      return '未找到匹配的项目。';
    }

    // 格式化输出
    const projectStatusMap: Record<string, string> = {
      '0': '进行中',
      '1': '已完成',
      '2': '已归档',
      '3': '已关闭',
    };

    const formattedProjects = projects.map(project => {
      const status = projectStatusMap[project.status || '0'] || '未知';
      const progress = Number(project.progress || 0).toFixed(0);
      const startDate = project.startTime ? project.startTime.toISOString().slice(0, 10) : '未设置';
      const endDate = project.endTime ? project.endTime.toISOString().slice(0, 10) : '未设置';

      return `- 项目ID: ${project.id}
  名称: ${project.projectName}
  状态: ${status}
  进度: ${progress}%
  开始时间: ${startDate}
  结束时间: ${endDate}
  负责人ID: ${project.ownerUserId}`;
    }).join('\n\n');

    return `找到 ${projects.length} 个项目：\n\n${formattedProjects}`;
  }
}

// 工具实例工厂函数
export function createProjectQueryTool() {
  return new ProjectQueryTool();
}