import {
  getProjectReportHeader,
  listTasksForProjectReport,
  listTenantProjectsWithTaskRows,
  mapAssigneeNickNames,
  type TaskReportRow,
} from '../../../services/task-read.service';
import type { ISkill, SkillParams, SkillContext, SkillResult } from '../../skill.types';
import { SkillCategory } from '../../skill.types';
import { buildConcisePortfolioWeeklyMarkdown, getIsoWeekRange, wantsAllProjectsWeekly } from './portfolio-weekly.shared';

/**
 * 周报生成Skill
 */
export class WeeklyReportSkill implements ISkill {
  id = 'weekly-report';
  name = '周报生成';
  description = '分析项目进度，生成结构化周报';
  icon = '📊';
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

    if (wantsAllProjectsWeekly(input)) {
      return this.executePortfolioWeekly(params, context);
    }

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
      const project = await getProjectReportHeader(tenantId, projectId);
      if (!project) {
        return {
          success: false,
          output: `项目 ${projectId} 不存在或无权限访问。`,
          error: '项目不存在或无权限',
        };
      }

      const tasks = await listTasksForProjectReport(tenantId, projectId);
      const userIds = [...new Set(tasks.map((t) => t.assigneeUserId).filter((id): id is bigint => id != null))];
      const userMap = await mapAssigneeNickNames(tenantId, userIds);

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

      const taskLines =
        tasks.length === 0
          ? '（暂无任务）'
          : tasks
              .map((t, i) => {
                const assignee = t.assigneeUserId ? userMap.get(t.assigneeUserId) || `用户${t.assigneeUserId}` : '未分配';
                const due = t.dueTime ? t.dueTime.toISOString().slice(0, 10) : '未设置';
                return `${i + 1}. [ID ${t.id}] ${t.taskName ?? '未命名'}｜${statusMap[t.status || '0'] || '未知'}｜${priorityMap[t.priority || '1'] || '中'}｜进度 ${Number(t.progress || 0).toFixed(0)}%｜截止 ${due}｜${riskMap[t.riskLevel || '0'] || '无风险'}｜负责人 ${assignee}`;
              })
              .join('\n');

      const nextWeek = this.buildNextWeekSuggestions(tasks);

      const report = `# ${project.projectName} 周报

## 项目概览
- **项目名称**: ${project.projectName ?? '未命名'}（项目 ID: ${project.id}）
- **项目状态**: ${this.getProjectStatus(project.status)}
- **当前进度**: ${Number(project.progress || 0).toFixed(0)}%
- **开始时间**: ${project.startTime ? project.startTime.toISOString().slice(0, 10) : '未设置'}
- **计划结束**: ${project.endTime ? project.endTime.toISOString().slice(0, 10) : '未设置'}

## 任务统计
- **任务总数**: ${totalTasks}
- **已完成**: ${completedTasks} (${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%)
- **进行中**: ${inProgressTasks}
- **延期**: ${delayedTasks}
- **高风险任务**: ${highRiskTasks}

## 本项目任务清单
${taskLines}

## 本周重点工作（高优先级）
${this.generateWeeklyHighlights(tasks, userMap)}

## 风险与问题
${this.generateRiskAnalysis(tasks, userMap)}

## 下周计划建议
${nextWeek.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

*报告生成时间: ${new Date().toLocaleString('zh-CN')}*`;

      return {
        success: true,
        output: report,
        skillId: this.id,
        tokensUsed: 0, // 实际使用时应统计Token
      };
    } catch (error) {
      console.error('周报生成失败:', error);
      return {
        success: false,
        output: '周报生成失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  private async executePortfolioWeekly(_params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { tenantId } = context;
    try {
      const bundles = await listTenantProjectsWithTaskRows(tenantId);
      if (bundles.length === 0) {
        return {
          success: true,
          output: "当前租户下暂无项目，无法生成本周全项目周报。",
          skillId: this.id,
          tokensUsed: 0,
        };
      }

      const week = getIsoWeekRange(new Date());
      const md = buildConcisePortfolioWeeklyMarkdown(week, bundles);

      return {
        success: true,
        output: md,
        skillId: this.id,
        tokensUsed: 0,
      };
    } catch (error) {
      console.error("全项目周报生成失败:", error);
      return {
        success: false,
        output: "全项目周报生成失败，请稍后重试。",
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  private buildNextWeekSuggestions(tasks: TaskReportRow[]): string[] {
    const out: string[] = [];
    const delayed = tasks.filter((t) => t.status === '3');
    const highRisk = tasks.filter((t) => ['2', '3'].includes(t.riskLevel ?? '0'));
    const inProgress = tasks.filter((t) => t.status === '1');
    if (delayed.length) {
      out.push(`优先处理 ${delayed.length} 条延期任务，与责任人确认新的目标日与阻塞原因。`);
    }
    if (highRisk.length) {
      out.push(`对 ${highRisk.length} 条中高风险任务做复盘，必要时调整范围或资源。`);
    }
    if (inProgress.length) {
      out.push(`跟进 ${inProgress.length} 条进行中任务，提前暴露依赖与进度偏差。`);
    }
    const soon = tasks.filter((t) => {
      if (!t.dueTime || t.status === '2') return false;
      const days = Math.ceil((t.dueTime.getTime() - Date.now()) / (86400 * 1000));
      return days >= 0 && days <= 7;
    });
    if (soon.length) {
      out.push(`未来 7 日内到期任务 ${soon.length} 条，建议排入下周计划并每日对齐。`);
    }
    if (out.length === 0) {
      out.push('结合里程碑安排下周迭代目标，并同步关键干系人。');
    }
    return out.slice(0, 6);
  }

  /**
   * 从输入中提取项目ID
   */
  private extractProjectId(input: string): string | null {
    const match = input.match(/项目\s*(\d+)/) || input.match(/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 获取项目状态文本
   */
  private getProjectStatus(status?: string | null): string {
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
  private generateWeeklyHighlights(tasks: any[], userMap: Map<bigint, string>): string {
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
  private generateRiskAnalysis(tasks: any[], userMap: Map<bigint, string>): string {
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