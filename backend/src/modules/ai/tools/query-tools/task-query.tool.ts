import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import type { ToolRunnableConfig } from '@langchain/core/tools';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../common/prisma';
import { toDbId } from '../../../../common/db-values';
import { enhancedContextFromToolConfig } from './enhanced-context-from-config';

/**
 * 任务查询工具输入参数
 */
const taskQuerySchema = z.object({
  taskId: z.string().optional().describe('任务ID，可选'),
  taskName: z.string().optional().describe('任务名称关键词，可选'),
  projectId: z.string().optional().describe('项目ID，可选'),
  assigneeUserId: z.string().optional().describe('负责人用户ID，可选'),
  status: z.string().optional().describe('任务状态（0:待开始,1:进行中,2:已完成,3:延期），可选'),
  limit: z.number().optional().default(20).describe('返回结果数量限制'),
});

type TaskQueryInput = z.infer<typeof taskQuerySchema>;

async function userCanAccessProject(
  tenantId: string,
  userId: string,
  projectId: bigint,
): Promise<boolean> {
  const member = await prisma.projectMember.findFirst({
    where: { tenantId, userId: toDbId(userId), projectId, delFlag: "0" },
    select: { id: true },
  });
  if (member) return true;
  const owned = await prisma.project.findFirst({
    where: { tenantId, id: projectId, ownerUserId: toDbId(userId), delFlag: "0" },
    select: { id: true },
  });
  return Boolean(owned);
}

/**
 * 任务查询工具
 * 用于查询任务信息，支持多种筛选条件
 */
export class TaskQueryTool extends StructuredTool {
  name = 'task_query';
  description = '查询任务信息，支持按任务ID、名称、项目、负责人、状态等条件查询。';
  schema = taskQuerySchema;

  constructor() {
    super();
  }

  async _call(
    input: TaskQueryInput,
    _runManager?: CallbackManagerForToolRun,
    parentConfig?: ToolRunnableConfig
  ): Promise<string> {
    const ctx = enhancedContextFromToolConfig(parentConfig);
    if (!ctx) {
      return '缺少租户或用户上下文，请通过已登录的 AI 对话调用。';
    }
    const { taskId, taskName, projectId, assigneeUserId, status, limit } = input;
    const { tenantId, userId } = ctx;

    // 构建查询条件
    const where: any = {
      tenantId,
      delFlag: '0',
    };

    if (taskId) {
      where.id = toDbId(taskId);
    }

    if (taskName) {
      where.taskName = {
        contains: taskName,
      };
    }

    if (projectId) {
      where.projectId = toDbId(projectId);
    }

    if (assigneeUserId) {
      where.assigneeUserId = toDbId(assigneeUserId);
    }

    if (status) {
      where.status = status;
    }

    const projectScoped = Boolean(projectId);
    if (projectScoped) {
      const pid = toDbId(projectId!);
      const allowed = await userCanAccessProject(tenantId, userId, pid);
      if (!allowed) {
        return `您没有权限查看项目 ${projectId} 下的任务。`;
      }
      if (taskId) {
        const tid = toDbId(taskId);
        const trow = await prisma.task.findFirst({
          where: { tenantId, id: tid, delFlag: "0" },
          select: { projectId: true },
        });
        if (!trow || trow.projectId !== pid) {
          return `任务 ${taskId} 不属于项目 ${projectId}，或不存在。`;
        }
      }
    } else {
      const userTasks = await prisma.task.findMany({
        where: {
          tenantId,
          OR: [
            { assigneeUserId: toDbId(userId) },
            { creatorUserId: toDbId(userId) },
            { createBy: toDbId(userId) },
          ],
          delFlag: "0",
        },
        select: { id: true },
        take: 1000,
      });

      const accessibleTaskIds = userTasks.map((t) => t.id);

      if (accessibleTaskIds.length === 0) {
        return "您没有可访问的任务。";
      }

      if (taskId && !accessibleTaskIds.includes(toDbId(taskId))) {
        return `您没有权限访问任务 ${taskId}。`;
      }

      if (!taskId) {
        where.id = { in: accessibleTaskIds };
      }
    }

    // 查询任务
    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        taskName: true,
        status: true,
        priority: true,
        progress: true,
        dueTime: true,
        riskLevel: true,
        projectId: true,
        assigneeUserId: true,
        creatorUserId: true,
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    if (tasks.length === 0) {
      return '未找到匹配的任务。';
    }

    // 格式化输出
    const taskStatusMap: Record<string, string> = {
      '0': '待开始',
      '1': '进行中',
      '2': '已完成',
      '3': '延期',
    };

    const priorityMap: Record<string, string> = {
      '0': '紧急',
      '1': '高',
      '2': '中',
      '3': '低',
    };

    const riskLevelMap: Record<string, string> = {
      '0': '无风险',
      '1': '低风险',
      '2': '中风险',
      '3': '高风险',
    };

    const formattedTasks = tasks.map(task => {
      const status = taskStatusMap[task.status || '0'] || '未知';
      const priority = priorityMap[task.priority || '1'] || '未知';
      const progress = Number(task.progress || 0).toFixed(0);
      const dueDate = task.dueTime ? task.dueTime.toISOString().slice(0, 10) : '未设置';
      const riskLevel = riskLevelMap[task.riskLevel || '0'] || '未知';

      return `- 任务ID: ${task.id}
  名称: ${task.taskName}
  状态: ${status}
  优先级: ${priority}
  进度: ${progress}%
  截止时间: ${dueDate}
  风险等级: ${riskLevel}
  项目ID: ${task.projectId || '未归属项目'}
  负责人ID: ${task.assigneeUserId}
  创建人ID: ${task.creatorUserId}`;
    }).join('\n\n');

    return `找到 ${tasks.length} 个任务：\n\n${formattedTasks}`;
  }
}

// 工具实例工厂函数
export function createTaskQueryTool() {
  return new TaskQueryTool();
}