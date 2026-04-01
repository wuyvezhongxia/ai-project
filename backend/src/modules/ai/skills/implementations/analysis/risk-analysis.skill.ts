import { toDbId } from '../../../../../common/db-values';
import { prisma } from '../../../../../common/prisma';
import type { ISkill, SkillParams, SkillContext, SkillResult } from '../../skill.types';
import { SkillCategory } from '../../skill.types';

/**
 * 风险分析Skill
 */
export class RiskAnalysisSkill implements ISkill {
  id = 'risk-analysis';
  name = '风险分析';
  description = '评估任务延期风险，提供建议';
  icon = '🔍';
  category = SkillCategory.ANALYSIS;
  requiresConfirmation = false;
  supportsStreaming = true;
  availableModels = ['deepseek', 'doubao'];

  tools = [];
  chains = [];
  prompts = [];

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId, userId } = context;

    // 解析输入，尝试提取任务ID
    const taskId = this.extractTaskId(input) || context.bizId;

    if (!taskId) {
      return {
        success: false,
        output: '请指定任务ID，或在上下文中关联任务。',
        error: '未提供任务ID',
      };
    }

    try {
      // 查询任务信息
      const task = await prisma.task.findFirst({
        where: {
          tenantId,
          id: toDbId(taskId),
          delFlag: '0',
        },
        select: {
          id: true,
          taskName: true,
          status: true,
          priority: true,
          progress: true,
          dueTime: true,
          riskLevel: true,
          taskDesc: true,
          assigneeUserId: true,
          projectId: true,
        },
      });

      if (!task) {
        return {
          success: false,
          output: `任务 ${taskId} 不存在或无权限访问。`,
          error: '任务不存在或无权限',
        };
      }

      // 计算风险分数
      const riskScore = this.calculateRiskScore(task);
      const riskLevel = this.getRiskLevel(riskScore);

      // 查询相关上下文
      let projectInfo = '';
      if (task.projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: task.projectId,
            delFlag: '0',
          },
          select: {
            projectName: true,
            progress: true,
            endTime: true,
          },
        });
        if (project) {
          projectInfo = `所属项目: ${project.projectName} (进度: ${Number(project.progress || 0).toFixed(0)}%)`;
        }
      }

      // 生成风险分析报告
      const analysis = this.generateRiskAnalysis(task, riskScore, riskLevel, projectInfo);

      return {
        success: true,
        output: analysis,
        skillId: this.id,
        tokensUsed: 0,
      };
    } catch (error) {
      console.error('风险分析失败:', error);
      return {
        success: false,
        output: '风险分析失败，请稍后重试。',
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
   * 计算风险分数 (0-100)
   */
  private calculateRiskScore(task: any): number {
    let score = 20; // 基础分

    // 状态权重
    if (task.status === '3') score += 40; // 延期
    else if (task.status === '0') score += 10; // 待开始
    else if (task.status === '1') score += 5; // 进行中

    // 风险等级权重
    if (task.riskLevel === '3') score += 25; // 高风险
    else if (task.riskLevel === '2') score += 15; // 中风险
    else if (task.riskLevel === '1') score += 5; // 低风险

    // 进度权重
    const progress = Number(task.progress || 0);
    if (progress < 30) score += 15;
    else if (progress < 60) score += 8;

    // 优先级权重
    if (task.priority === '0') score += 15; // 紧急
    else if (task.priority === '1') score += 8; // 高

    // 时间权重
    if (task.dueTime) {
      const now = new Date();
      const dueDate = task.dueTime;
      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft < 0) score += 20; // 已超期
      else if (daysLeft <= 3) score += 15; // 3天内到期
      else if (daysLeft <= 7) score += 8; // 一周内到期
    }

    // 描述长度权重（描述越简单，风险越高？）
    if (!task.taskDesc || task.taskDesc.length < 20) score += 5;

    return Math.min(score, 100);
  }

  /**
   * 获取风险等级
   */
  private getRiskLevel(score: number): string {
    if (score >= 75) return '高';
    if (score >= 45) return '中';
    return '低';
  }

  /**
   * 生成风险分析报告
   */
  private generateRiskAnalysis(task: any, score: number, level: string, projectInfo: string): string {
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

    const status = statusMap[task.status || '0'] || '未知';
    const priority = priorityMap[task.priority || '1'] || '未知';
    const currentRisk = riskMap[task.riskLevel || '0'] || '未知';
    const progress = Number(task.progress || 0).toFixed(0);
    const dueDate = task.dueTime ? task.dueTime.toISOString().slice(0, 10) : '未设置';
    const assignee = task.assigneeUserId ? `用户${task.assigneeUserId}` : '未分配';

    // 生成报告
    return `# 任务风险分析报告

## 任务基本信息
- **任务ID**: ${task.id}
- **任务名称**: ${task.taskName}
- **当前状态**: ${status}
- **优先级**: ${priority}
- **进度**: ${progress}%
- **截止时间**: ${dueDate}
- **负责人**: ${assignee}
- **当前风险等级**: ${currentRisk}
${projectInfo ? `- ${projectInfo}` : ''}

## 风险评估结果
- **风险分数**: ${score}/100
- **风险等级**: ${level}

## 主要风险因素
${this.getRiskFactors(task, score)}

## 应对建议
${this.getRecommendations(task, score, level)}

## 监控指标
1. 每日进度更新频率
2. 截止时间前剩余工作日
3. 相关依赖任务状态
4. 资源可用性变化

---

*分析生成时间: ${new Date().toLocaleString('zh-CN')}*`;
  }

  /**
   * 获取风险因素
   */
  private getRiskFactors(task: any, score: number): string {
    const factors: string[] = [];

    if (task.status === '3') {
      factors.push('任务已延期，需立即处理');
    }

    if (task.riskLevel === '3') {
      factors.push('系统标记为高风险任务');
    }

    if (task.priority === '0') {
      factors.push('紧急优先级，时间压力大');
    }

    const progress = Number(task.progress || 0);
    if (progress < 30 && task.status === '1') {
      factors.push('进度滞后，进行中但完成度低');
    }

    if (task.dueTime) {
      const now = new Date();
      const daysLeft = Math.ceil((task.dueTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) {
        factors.push('已超过截止时间');
      } else if (daysLeft <= 3) {
        factors.push(`仅剩${daysLeft}天，时间紧迫`);
      }
    }

    if (!task.taskDesc || task.taskDesc.length < 20) {
      factors.push('任务描述简单，可能存在理解偏差');
    }

    if (factors.length === 0) {
      return '未识别到显著风险因素。';
    }

    return factors.map(f => `- ${f}`).join('\n');
  }

  /**
   * 获取应对建议
   */
  private getRecommendations(task: any, score: number, level: string): string {
    const recommendations: string[] = [];

    if (level === '高' || score >= 75) {
      recommendations.push('立即召开风险会议，制定应急计划');
      recommendations.push('考虑增加资源或调整范围');
      recommendations.push('每日跟踪进展，及时上报问题');
    } else if (level === '中') {
      recommendations.push('加强监控频率，至少每周两次检查');
      recommendations.push('明确里程碑和验收标准');
      recommendations.push('识别并缓解关键依赖风险');
    } else {
      recommendations.push('保持正常监控节奏');
      recommendations.push('定期更新进度状态');
    }

    if (task.status === '3') {
      recommendations.push('重新评估并更新截止时间');
      recommendations.push('分析延期原因，避免重复发生');
    }

    if (task.progress && Number(task.progress) < 50 && task.status === '1') {
      recommendations.push('分解任务，设置中间检查点');
      recommendations.push('确认资源是否充足');
    }

    if (task.dueTime) {
      const now = new Date();
      const daysLeft = Math.ceil((task.dueTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        recommendations.push('制定详细的时间安排，精确到日');
      }
    }

    return recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }
}