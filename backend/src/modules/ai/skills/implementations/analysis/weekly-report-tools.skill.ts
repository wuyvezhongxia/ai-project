import { getToolRegistry } from '../../../tools/tool.registry';
import type { ISkill, SkillParams, SkillContext, SkillResult, EnhancedContext } from '../../skill.types';
import { SkillCategory } from '../../skill.types';

/**
 * 周报生成Skill（工具调用版本）
 * 演示如何使用工具查询数据，而不是直接访问数据库
 */
export class WeeklyReportToolsSkill implements ISkill {
  id = 'weekly-report-tools';
  name = '周报生成（工具版）';
  description = '使用工具查询数据，生成结构化周报';
  icon = '🔧';
  category = SkillCategory.ANALYSIS;
  requiresConfirmation = false;
  supportsStreaming = true;
  availableModels = ['deepseek', 'doubao'];

  tools = [
    { name: 'project_query' },
    { name: 'task_query' },
    { name: 'user_query' },
  ];
  chains = [];
  prompts = [];

  private toolRegistry = getToolRegistry();

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId, userId } = context;

    // 解析输入，尝试提取项目ID
    const projectId = this.extractProjectId(input) || context.bizId;

    if (!projectId) {
      return {
        success: false,
        output: '请指定项目ID，或在上下文中关联项目。',
        error: '未提供项目ID',
      };
    }

    try {
      // 构建增强上下文（带租户过滤）
      const enhancedContext: EnhancedContext = {
        userId,
        tenantId,
        sessionId: context.sessionId,
        tenantFilter: { tenantId },
      };

      // 1. 使用project_query工具查询项目信息
      const projectTool = this.toolRegistry.getTool('project_query');
      if (!projectTool) {
        return {
          success: false,
          output: '项目查询工具不可用，请检查配置。',
          error: '工具不可用',
        };
      }

      const projectResult = await projectTool.invoke(
        { projectId, limit: 1 },
        enhancedContext
      );

      // 解析工具返回的文本（简化处理）
      const projectInfo = this.parseProjectInfo(projectResult as string);
      if (!projectInfo) {
        return {
          success: false,
          output: `项目 ${projectId} 不存在或无权限访问。`,
          error: '项目不存在或无权限',
        };
      }

      // 2. 使用task_query工具查询项目任务
      const taskTool = this.toolRegistry.getTool('task_query');
      if (!taskTool) {
        return {
          success: false,
          output: '任务查询工具不可用，请检查配置。',
          error: '工具不可用',
        };
      }

      const taskResult = await taskTool.invoke(
        { projectId, limit: 100 },
        enhancedContext
      );

      // 解析任务数据
      const tasks = this.parseTasks(taskResult as string);

      // 3. 如果需要，使用user_query工具查询用户信息
      const assigneeIds = tasks.map(t => t.assigneeUserId).filter(Boolean);
      let userMap = new Map<string, string>();

      if (assigneeIds.length > 0) {
        const userTool = this.toolRegistry.getTool('user_query');
        if (userTool) {
          // 简化：只查询第一个用户作为示例
          const userResult = await userTool.invoke(
            { userId: assigneeIds[0], limit: 1 },
            enhancedContext
          );
          const userInfo = this.parseUserInfo(userResult as string);
          if (userInfo) {
            userMap.set(assigneeIds[0], userInfo.nickName);
          }
        }
      }

      // 统计数据
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === '2').length;
      const inProgressTasks = tasks.filter(t => t.status === '1').length;
      const delayedTasks = tasks.filter(t => t.status === '3').length;
      const highRiskTasks = tasks.filter(t => ['2', '3'].includes(t.riskLevel || '0')).length;

      // 状态映射
      const statusMap: Record<string, string> = {
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

      const riskMap: Record<string, string> = {
        '0': '无风险',
        '1': '低风险',
        '2': '中风险',
        '3': '高风险',
      };

      // 生成周报
      const report = `# ${projectInfo.projectName} 周报（工具版）

## 项目概览
- **项目状态**: ${this.getProjectStatus(projectInfo.status)}
- **当前进度**: ${Number(projectInfo.progress || 0).toFixed(0)}%
- **开始时间**: ${projectInfo.startTime || '未设置'}
- **计划结束**: ${projectInfo.endTime || '未设置'}

## 任务统计（基于工具查询）
- **任务总数**: ${totalTasks}
- **已完成**: ${completedTasks} (${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%)
- **进行中**: ${inProgressTasks}
- **延期**: ${delayedTasks}
- **高风险任务**: ${highRiskTasks}

## 工具使用说明
本报告使用以下工具查询数据：
1. project_query - 查询项目信息
2. task_query - 查询任务信息
3. user_query - 查询用户信息

## 数据来源
所有数据均通过系统工具查询获得，确保数据准确性和权限控制。

---
*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
*技能版本: 工具调用版*`;

      return {
        success: true,
        output: report,
        skillId: this.id,
        toolCalls: [
          {
            toolName: 'project_query',
            input: JSON.stringify({ projectId, limit: 1 }),
            output: projectResult as string,
            duration: 0, // 实际应记录持续时间
          },
          {
            toolName: 'task_query',
            input: JSON.stringify({ projectId, limit: 100 }),
            output: taskResult as string,
            duration: 0,
          },
        ],
        tokensUsed: 0,
      };
    } catch (error) {
      console.error('周报生成（工具版）失败:', error);
      return {
        success: false,
        output: '周报生成失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 从输入中提取项目ID
   */
  private extractProjectId(input: string): string | null {
    const match = input.match(/项目\s*(\d+)/) || input.match(/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 解析项目信息（简化解析）
   */
  private parseProjectInfo(toolOutput: string): any {
    // 简化解析，实际项目中需要更健壮的解析逻辑
    const lines = toolOutput.split('\n');
    const project: any = {};

    for (const line of lines) {
      if (line.includes('项目ID:')) {
        project.id = line.split(':')[1]?.trim();
      } else if (line.includes('名称:')) {
        project.projectName = line.split(':')[1]?.trim();
      } else if (line.includes('状态:')) {
        const statusText = line.split(':')[1]?.trim();
        // 反向映射状态文本到状态码
        const statusMap: Record<string, string> = {
          '进行中': '0',
          '已完成': '1',
          '已归档': '2',
          '已关闭': '3',
        };
        project.status = statusMap[statusText] || '0';
      } else if (line.includes('进度:')) {
        const progressText = line.split(':')[1]?.trim();
        const match = progressText?.match(/(\d+)%/);
        project.progress = match ? match[1] : '0';
      } else if (line.includes('开始时间:')) {
        project.startTime = line.split(':')[1]?.trim();
      } else if (line.includes('结束时间:')) {
        project.endTime = line.split(':')[1]?.trim();
      }
    }

    return project.id ? project : null;
  }

  /**
   * 解析任务信息
   */
  private parseTasks(toolOutput: string): any[] {
    const tasks: any[] = [];
    const taskBlocks = toolOutput.split('\n\n');

    for (const block of taskBlocks) {
      const lines = block.split('\n');
      const task: any = {};

      for (const line of lines) {
        if (line.includes('任务ID:')) {
          task.id = line.split(':')[1]?.trim();
        } else if (line.includes('名称:')) {
          task.taskName = line.split(':')[1]?.trim();
        } else if (line.includes('状态:')) {
          const statusText = line.split(':')[1]?.trim();
          const statusMap: Record<string, string> = {
            '待开始': '0',
            '进行中': '1',
            '已完成': '2',
            '延期': '3',
          };
          task.status = statusMap[statusText] || '0';
        } else if (line.includes('优先级:')) {
          const priorityText = line.split(':')[1]?.trim();
          const priorityMap: Record<string, string> = {
            '紧急': '0',
            '高': '1',
            '中': '2',
            '低': '3',
          };
          task.priority = priorityMap[priorityText] || '1';
        } else if (line.includes('进度:')) {
          const progressText = line.split(':')[1]?.trim();
          const match = progressText?.match(/(\d+)%/);
          task.progress = match ? match[1] : '0';
        } else if (line.includes('风险等级:')) {
          const riskText = line.split(':')[1]?.trim();
          const riskMap: Record<string, string> = {
            '无风险': '0',
            '低风险': '1',
            '中风险': '2',
            '高风险': '3',
          };
          task.riskLevel = riskMap[riskText] || '0';
        } else if (line.includes('负责人ID:')) {
          task.assigneeUserId = line.split(':')[1]?.trim();
        }
      }

      if (task.id) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * 解析用户信息
   */
  private parseUserInfo(toolOutput: string): any {
    const lines = toolOutput.split('\n');
    const user: any = {};

    for (const line of lines) {
      if (line.includes('用户ID:')) {
        user.userId = line.split(':')[1]?.trim();
      } else if (line.includes('昵称:')) {
        user.nickName = line.split(':')[1]?.trim();
      } else if (line.includes('部门:')) {
        user.deptName = line.split(':')[1]?.trim();
      }
    }

    return user.userId ? user : null;
  }

  /**
   * 获取项目状态文本
   */
  private getProjectStatus(status?: string): string {
    const map: Record<string, string> = {
      '0': '进行中',
      '1': '已完成',
      '2': '已归档',
      '3': '已关闭',
    };
    return status ? map[status] || '未知' : '未知';
  }
}