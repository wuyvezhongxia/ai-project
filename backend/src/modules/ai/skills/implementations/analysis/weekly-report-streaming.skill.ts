import { getToolRegistry } from '../../../tools/tool.registry';
import { getLLMManager } from '../../../llms/llm.manager';
import type { ISkill, SkillParams, SkillContext, SkillResult, EnhancedContext } from '../../skill.types';
import { SkillCategory } from '../../skill.types';

/**
 * 周报生成Skill（流式工具调用版本）
 * 使用工具查询数据，并通过LLM流式生成报告
 */
export class WeeklyReportStreamingSkill implements ISkill {
  id = 'weekly-report-streaming';
  name = '周报生成（流式工具版）';
  description = '使用工具查询数据，并通过LLM流式生成结构化周报';
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
  private llmManager = getLLMManager();

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId, userId, onToken } = context;

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

      // 1. 使用工具查询数据
      const { projectInfo, tasks, userMap } = await this.queryDataWithTools(projectId, enhancedContext);

      if (!projectInfo) {
        return {
          success: false,
          output: `项目 ${projectId} 不存在或无权限访问。`,
          error: '项目不存在或无权限',
        };
      }

      // 如果有onToken回调，使用流式LLM生成报告
      if (onToken) {
        return await this.generateStreamingReport(projectInfo, tasks, userMap, onToken, enhancedContext);
      } else {
        // 否则生成静态报告
        const report = this.generateStaticReport(projectInfo, tasks, userMap);
        return {
          success: true,
          output: report,
          skillId: this.id,
          tokensUsed: 0,
        };
      }
    } catch (error) {
      console.error('周报生成（流式工具版）失败:', error);
      return {
        success: false,
        output: '周报生成失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 使用工具查询数据
   */
  private async queryDataWithTools(projectId: string, enhancedContext: EnhancedContext): Promise<{
    projectInfo: any;
    tasks: any[];
    userMap: Map<string, string>;
  }> {
    // 1. 查询项目信息
    const projectTool = this.toolRegistry.getTool('project_query');
    if (!projectTool) {
      throw new Error('项目查询工具不可用');
    }
    const projectResult = await projectTool.invoke(
      { projectId, limit: 1 },
      enhancedContext as any
    );
    const projectInfo = this.parseProjectInfo(projectResult as string);
    if (!projectInfo) {
      throw new Error('项目不存在或无权限');
    }

    // 2. 查询项目任务
    const taskTool = this.toolRegistry.getTool('task_query');
    if (!taskTool) {
      throw new Error('任务查询工具不可用');
    }
    const taskResult = await taskTool.invoke(
      { projectId, limit: 100 },
      enhancedContext as any
    );
    const tasks = this.parseTasks(taskResult as string);

    // 3. 查询用户信息
    const assigneeIds = tasks.map(t => t.assigneeUserId).filter(Boolean);
    let userMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const userTool = this.toolRegistry.getTool('user_query');
      if (userTool) {
        // 批量查询用户（简化：只查询第一个）
        const userResult = await userTool.invoke(
          { userId: assigneeIds[0], limit: 1 },
          enhancedContext as any
        );
        const userInfo = this.parseUserInfo(userResult as string);
        if (userInfo) {
          userMap.set(assigneeIds[0], userInfo.nickName);
        }
      }
    }

    return { projectInfo, tasks, userMap };
  }

  /**
   * 生成流式报告
   */
  private async generateStreamingReport(
    projectInfo: any,
    tasks: any[],
    userMap: Map<string, string>,
    onToken: (token: string) => void,
    enhancedContext: EnhancedContext
  ): Promise<SkillResult> {
    // 构建提示词
    const prompt = this.buildReportPrompt(projectInfo, tasks, userMap);

    try {
      // 获取LLM实例
      const llm = await this.llmManager.getLLMForTenant(enhancedContext.tenantId);

      // 调用流式API
      const messages = [
        { role: 'system' as const, content: '你是一个专业的项目经理，请根据提供的数据生成一份清晰、结构化的周报。' },
        { role: 'user' as const, content: prompt },
      ];

      // 注意：这里需要适配LangChain的流式调用
      // 简化实现：使用fetch直接调用DeepSeek流式API
      const output = await this.callDeepSeekStreaming(messages, onToken);

      return {
        success: true,
        output,
        skillId: this.id,
        tokensUsed: Math.ceil(output.length / 4),
      };
    } catch (error) {
      console.error('流式报告生成失败:', error);
      // 降级到静态报告
      const report = this.generateStaticReport(projectInfo, tasks, userMap);
      return {
        success: true,
        output: report,
        skillId: this.id,
        tokensUsed: 0,
      };
    }
  }

  /**
   * 调用DeepSeek流式API（简化实现）
   */
  private async callDeepSeekStreaming(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    onToken: (token: string) => void
  ): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      throw new Error('未配置 DEEPSEEK_API_KEY');
    }

    const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DeepSeek流式请求失败(${response.status}) ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const line = event
          .split('\n')
          .find((item) => item.startsWith('data:'));
        if (!line) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let parsed: { choices?: Array<{ delta?: { content?: string } }> } | null = null;
        try {
          parsed = JSON.parse(payload);
        } catch {
          parsed = null;
        }
        if (!parsed) continue;

        const token = parsed.choices?.[0]?.delta?.content ?? '';
        if (!token) continue;
        output += token;
        onToken(token);
      }
    }

    return output;
  }

  /**
   * 构建报告提示词
   */
  private buildReportPrompt(projectInfo: any, tasks: any[], userMap: Map<string, string>): string {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === '2').length;
    const inProgressTasks = tasks.filter(t => t.status === '1').length;
    const delayedTasks = tasks.filter(t => t.status === '3').length;
    const highRiskTasks = tasks.filter(t => ['2', '3'].includes(t.riskLevel || '0')).length;

    return `请根据以下项目数据生成一份周报：

项目名称：${projectInfo.projectName}
项目状态：${this.getProjectStatus(projectInfo.status)}
当前进度：${Number(projectInfo.progress || 0).toFixed(0)}%
开始时间：${projectInfo.startTime || '未设置'}
计划结束：${projectInfo.endTime || '未设置'}

任务统计：
- 任务总数：${totalTasks}
- 已完成：${completedTasks} (${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%)
- 进行中：${inProgressTasks}
- 延期：${delayedTasks}
- 高风险任务：${highRiskTasks}

请生成一份结构清晰的周报，包含以下部分：
1. 项目概览
2. 本周工作进展
3. 风险与问题
4. 下周计划建议

报告要简洁、实用，使用中文。`;
  }

  /**
   * 生成静态报告
   */
  private generateStaticReport(projectInfo: any, tasks: any[], userMap: Map<string, string>): string {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === '2').length;
    const inProgressTasks = tasks.filter(t => t.status === '1').length;
    const delayedTasks = tasks.filter(t => t.status === '3').length;
    const highRiskTasks = tasks.filter(t => ['2', '3'].includes(t.riskLevel || '0')).length;

    return `# ${projectInfo.projectName} 周报（流式工具版）

## 项目概览
- **项目状态**: ${this.getProjectStatus(projectInfo.status)}
- **当前进度**: ${Number(projectInfo.progress || 0).toFixed(0)}%
- **开始时间**: ${projectInfo.startTime || '未设置'}
- **计划结束**: ${projectInfo.endTime || '未设置'}

## 任务统计
- **任务总数**: ${totalTasks}
- **已完成**: ${completedTasks} (${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%)
- **进行中**: ${inProgressTasks}
- **延期**: ${delayedTasks}
- **高风险任务**: ${highRiskTasks}

## 本周重点工作
${this.generateWeeklyHighlights(tasks, userMap)}

## 风险与问题
${this.generateRiskAnalysis(tasks, userMap)}

## 下周计划建议
1. 优先处理高风险和延期任务
2. 跟进进度滞后任务的责任人
3. 更新项目里程碑和验收标准

---

*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
*技能版本: 流式工具调用版*`;
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
    const lines = toolOutput.split('\n');
    const project: any = {};

    for (const line of lines) {
      if (line.includes('项目ID:')) {
        project.id = line.split(':')[1]?.trim();
      } else if (line.includes('名称:')) {
        project.projectName = line.split(':')[1]?.trim();
      } else if (line.includes('状态:')) {
        const statusText = line.split(':')[1]?.trim();
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

  /**
   * 生成本周重点工作
   */
  private generateWeeklyHighlights(tasks: any[], userMap: Map<string, string>): string {
    const highPriorityTasks = tasks.filter(t => t.priority === '0' || t.priority === '1');

    if (highPriorityTasks.length === 0) {
      return '本周无高优先级任务。';
    }

    const highlights = highPriorityTasks.slice(0, 5).map(task => {
      const assignee = task.assigneeUserId ? userMap.get(task.assigneeUserId) || `用户${task.assigneeUserId}` : '未分配';
      const dueDate = task.dueTime ? task.dueTime.toISOString().slice(0, 10) : '未设置截止';
      return `- **${task.taskName}** (负责人: ${assignee}, 截止: ${dueDate}, 进度: ${Number(task.progress || 0).toFixed(0)}%)`;
    }).join('\n');

    return highlights;
  }

  /**
   * 生成风险分析
   */
  private generateRiskAnalysis(tasks: any[], userMap: Map<string, string>): string {
    const riskTasks = tasks.filter(t => ['2', '3'].includes(t.riskLevel || '0') || t.status === '3');

    if (riskTasks.length === 0) {
      return '本周无高风险任务。';
    }

    const analysis = riskTasks.slice(0, 5).map(task => {
      const assignee = task.assigneeUserId ? userMap.get(task.assigneeUserId) || `用户${task.assigneeUserId}` : '未分配';
      const dueDate = task.dueTime ? task.dueTime.toISOString().slice(0, 10) : '未设置截止';
      const daysLeft = task.dueTime ? Math.ceil((task.dueTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

      let riskDesc = '';
      if (task.status === '3') {
        riskDesc = '已延期';
      } else if (daysLeft !== null && daysLeft <= 3) {
        riskDesc = `仅剩${daysLeft}天`;
      } else {
        riskDesc = '高风险';
      }

      return `- **${task.taskName}** (负责人: ${assignee}, 风险: ${riskDesc}, 进度: ${Number(task.progress || 0).toFixed(0)}%)`;
    }).join('\n');

    return `以下任务需要重点关注：\n${analysis}`;
  }
}