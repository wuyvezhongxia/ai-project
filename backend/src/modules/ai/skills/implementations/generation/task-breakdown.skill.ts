import { toDbId } from '../../../../../common/db-values';
import { prisma } from '../../../../../common/prisma';
import type { ISkill, SkillParams, SkillContext, SkillResult } from '../../skill.types';
import { SkillCategory } from '../../skill.types';

/**
 * 任务拆解Skill
 */
export class TaskBreakdownSkill implements ISkill {
  id = 'task-breakdown';
  name = '任务拆解';
  description = '将复杂任务智能分解为子任务';
  icon = '📋';
  category = SkillCategory.GENERATION;
  requiresConfirmation = false;
  supportsStreaming = true;
  availableModels = ['deepseek', 'doubao'];

  tools = [];
  chains = [];
  prompts = [];

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId, userId } = context;

    // 解析输入，尝试提取任务ID或任务描述
    const taskId = this.extractTaskId(input);
    const taskDescription = this.extractTaskDescription(input);

    try {
      let taskInfo: any = null;
      let projectId: bigint | null = null;

      if (taskId) {
        // 查询现有任务
        taskInfo = await prisma.task.findFirst({
          where: {
            tenantId,
            id: toDbId(taskId),
            delFlag: '0',
          },
          select: {
            id: true,
            taskName: true,
            taskDesc: true,
            projectId: true,
            assigneeUserId: true,
            dueTime: true,
            priority: true,
          },
        });

        if (taskInfo) {
          projectId = taskInfo.projectId;
        }
      }

      // 生成拆解建议
      const breakdown = await this.generateBreakdown(
        taskInfo ? taskInfo.taskName : taskDescription,
        taskInfo ? taskInfo.taskDesc : null,
        projectId,
        context
      );

      return {
        success: true,
        output: breakdown,
        skillId: this.id,
        tokensUsed: 0,
      };
    } catch (error) {
      console.error('任务拆解失败:', error);
      return {
        success: false,
        output: '任务拆解失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 从输入中提取任务ID
   */
  private extractTaskId(input: string): string | null {
    const match = input.match(/任务\s*(\d+)/) || input.match(/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 从输入中提取任务描述
   */
  private extractTaskDescription(input: string): string {
    // 移除可能的命令前缀
    const cleaned = input
      .replace(/^(拆解|分解|拆分|分析)\s*(任务)?\s*/i, '')
      .replace(/^"|"$/g, '')
      .trim();

    return cleaned || '未命名任务';
  }

  /**
   * 生成任务拆解
   */
  private async generateBreakdown(
    taskName: string,
    taskDescription: string | null,
    projectId: bigint | null,
    context: SkillContext
  ): Promise<string> {
    // 分析任务复杂度
    const complexity = this.analyzeComplexity(taskName, taskDescription);

    // 生成子任务结构
    const subtasks = this.generateSubtasks(taskName, taskDescription, complexity);

    // 估算工时
    const timeEstimate = this.estimateTime(complexity, subtasks.length);

    // 生成依赖关系
    const dependencies = this.identifyDependencies(subtasks);

    // 生成拆解报告
    return this.formatBreakdownReport(
      taskName,
      taskDescription,
      complexity,
      subtasks,
      timeEstimate,
      dependencies,
      projectId
    );
  }

  /**
   * 分析任务复杂度
   */
  private analyzeComplexity(taskName: string, taskDescription: string | null): 'simple' | 'medium' | 'complex' {
    const text = (taskDescription || taskName).toLowerCase();
    let score = 0;

    // 基于关键词的复杂度评估
    const complexityIndicators = [
      { words: ['系统', '平台', '架构', '框架', '集成'], weight: 3 },
      { words: ['模块', '组件', '接口', 'API', '服务'], weight: 2 },
      { words: ['功能', '特性', '页面', '界面', 'UI'], weight: 1 },
      { words: ['简单', '基础', '基本', '小的'], weight: -1 },
    ];

    for (const indicator of complexityIndicators) {
      for (const word of indicator.words) {
        if (text.includes(word)) {
          score += indicator.weight;
        }
      }
    }

    // 基于长度的评估
    const length = text.length;
    if (length > 200) score += 2;
    else if (length > 100) score += 1;
    else if (length < 30) score -= 1;

    if (score >= 5) return 'complex';
    if (score >= 2) return 'medium';
    return 'simple';
  }

  /**
   * 生成子任务
   */
  private generateSubtasks(taskName: string, taskDescription: string | null, complexity: string): Array<{
    id: number;
    name: string;
    description: string;
    estimatedHours: number;
    dependencies: number[];
  }> {
    const subtasks: Array<{
      id: number;
      name: string;
      description: string;
      estimatedHours: number;
      dependencies: number[];
    }> = [];

    // 根据复杂度确定子任务数量
    let subtaskCount = 3;
    if (complexity === 'medium') subtaskCount = 5;
    if (complexity === 'complex') subtaskCount = 8;

    // 常见的任务阶段模板
    const phases = [
      { name: '需求分析与澄清', desc: '明确需求细节、验收标准、成功指标' },
      { name: '方案设计与评审', desc: '制定技术方案、架构设计、评审通过' },
      { name: '开发实现', desc: '编码、单元测试、代码审查' },
      { name: '测试验证', desc: '集成测试、系统测试、问题修复' },
      { name: '部署上线', desc: '环境准备、部署实施、上线验证' },
      { name: '文档与培训', desc: '编写文档、培训用户、知识转移' },
      { name: '复盘总结', desc: '项目复盘、经验总结、优化建议' },
    ];

    // 根据复杂度和任务描述选择阶段
    const selectedPhases = phases.slice(0, Math.min(subtaskCount, phases.length));

    // 生成子任务
    selectedPhases.forEach((phase, index) => {
      const subtaskId = index + 1;
      const dependencies = index > 0 ? [subtaskId - 1] : [];

      // 估算工时（根据复杂度调整）
      let estimatedHours = 8; // 默认8小时
      if (complexity === 'medium') estimatedHours = 16;
      if (complexity === 'complex') estimatedHours = 24;
      if (index === 0 || index === selectedPhases.length - 1) estimatedHours = Math.floor(estimatedHours * 0.75); // 首尾阶段稍短

      subtasks.push({
        id: subtaskId,
        name: `${phase.name}`,
        description: `${phase.desc}，针对任务"${taskName}"`,
        estimatedHours,
        dependencies,
      });
    });

    return subtasks;
  }

  /**
   * 估算总工时
   */
  private estimateTime(complexity: string, subtaskCount: number): {
    optimistic: number;
    realistic: number;
    pessimistic: number;
  } {
    const baseHours = complexity === 'simple' ? 4 : complexity === 'medium' ? 8 : 16;
    const totalBase = baseHours * subtaskCount;

    return {
      optimistic: Math.floor(totalBase * 0.8),
      realistic: totalBase,
      pessimistic: Math.ceil(totalBase * 1.5),
    };
  }

  /**
   * 识别依赖关系
   */
  private identifyDependencies(subtasks: Array<{ id: number; dependencies: number[] }>): string[] {
    const dependencies: string[] = [];

    subtasks.forEach(subtask => {
      if (subtask.dependencies.length > 0) {
        const deps = subtask.dependencies.map(dep => `子任务${dep}`).join('、');
        dependencies.push(`子任务${subtask.id} 依赖于 ${deps}`);
      }
    });

    return dependencies;
  }

  /**
   * 格式化拆解报告
   */
  private formatBreakdownReport(
    taskName: string,
    taskDescription: string | null,
    complexity: string,
    subtasks: any[],
    timeEstimate: any,
    dependencies: string[],
    projectId: bigint | null
  ): string {
    const complexityMap = {
      simple: '简单',
      medium: '中等',
      complex: '复杂',
    };

    return `# 任务拆解报告

## 任务概况
- **任务名称**: ${taskName}
- **任务描述**: ${taskDescription || '无详细描述'}
- **复杂度评估**: ${complexityMap[complexity as keyof typeof complexityMap]}
- **所属项目ID**: ${projectId || '未指定'}

## 子任务分解
${subtasks.map(subtask => `
### 子任务${subtask.id}: ${subtask.name}
- **描述**: ${subtask.description}
- **预估工时**: ${subtask.estimatedHours} 小时
- **前置依赖**: ${subtask.dependencies.length > 0 ? subtask.dependencies.map(d => `子任务${d}`).join('、') : '无'}
`).join('')}

## 工时估算
- **乐观估算**: ${timeEstimate.optimistic} 小时
- **现实估算**: ${timeEstimate.realistic} 小时
- **保守估算**: ${timeEstimate.pessimistic} 小时
- **建议排期**: ${Math.ceil(timeEstimate.realistic / 8)} 个工作日（按每天8小时计）

## 依赖关系
${dependencies.length > 0 ? dependencies.map(dep => `- ${dep}`).join('\n') : '无复杂依赖关系'}

## 建议执行顺序
${this.getExecutionOrder(subtasks)}

## 成功关键因素
1. 明确每个子任务的验收标准
2. 定期检查进度，及时调整计划
3. 确保依赖任务按时完成
4. 预留缓冲时间应对不确定性

## 一键创建建议
上述子任务可以一键创建为实际任务，每个子任务将：
- 继承原任务的租户、项目信息
- 自动设置依赖关系
- 分配建议的工时和优先级

---

*拆解生成时间: ${new Date().toLocaleString('zh-CN')}*`;
  }

  /**
   * 获取执行顺序建议
   */
  private getExecutionOrder(subtasks: any[]): string {
    const order: number[] = [];
    const visited = new Set<number>();

    // 简单的拓扑排序（依赖关系简单）
    subtasks.forEach(subtask => {
      if (subtask.dependencies.length === 0) {
        order.push(subtask.id);
        visited.add(subtask.id);
      }
    });

    // 第二层
    subtasks.forEach(subtask => {
      if (!visited.has(subtask.id) && subtask.dependencies.every((dep: number) => visited.has(dep))) {
        order.push(subtask.id);
        visited.add(subtask.id);
      }
    });

    // 剩余
    subtasks.forEach(subtask => {
      if (!visited.has(subtask.id)) {
        order.push(subtask.id);
      }
    });

    return order.map(id => `子任务${id}`).join(' → ');
  }
}