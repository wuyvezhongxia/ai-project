import {
  getProjectReportHeader,
  listTasksForProjectReport,
  listTenantProjectsWithTaskRows,
  mapAssigneeNickNames,
  type TaskReportRow,
} from '../../../services/task-read.service';
import type { ISkill, SkillParams, SkillContext, SkillResult } from '../../skill.types';
import { SkillCategory } from '../../skill.types';
import { buildConcisePortfolioWeeklyMarkdown, wantsAllProjectsWeekly } from './portfolio-weekly.shared';

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

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { input } = params;
    const { tenantId, userId, onToken } = context;

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

      const taskRows = await listTasksForProjectReport(tenantId, projectId);
      const assigneeIds = [...new Set(taskRows.map((t) => t.assigneeUserId).filter((x): x is bigint => x != null))];
      const nickMap = await mapAssigneeNickNames(tenantId, assigneeIds);
      const userMap = new Map<string, string>();
      for (const [bid, name] of nickMap) {
        userMap.set(String(bid), name?.trim() ? name : `用户${bid}`);
      }

      const projectInfo = {
        id: String(project.id),
        projectName: project.projectName ?? '未命名项目',
        status: project.status ?? '0',
        progress: project.progress,
        startTime: project.startTime ? project.startTime.toISOString().slice(0, 10) : '未设置',
        endTime: project.endTime ? project.endTime.toISOString().slice(0, 10) : '未设置',
      };

      const tasks = taskRows.map((t) => ({
        id: String(t.id),
        taskName: t.taskName,
        status: t.status ?? '0',
        priority: t.priority ?? '1',
        progress: t.progress,
        dueTime: t.dueTime,
        riskLevel: t.riskLevel ?? '0',
        assigneeUserId: t.assigneeUserId != null ? String(t.assigneeUserId) : undefined,
      }));

      const week = this.getWeekRange(new Date());
      const taskInventory = this.formatTaskInventory(taskRows, userMap);

      if (onToken) {
        return await this.generateStreamingReport(
          projectInfo,
          tasks,
          userMap,
          taskRows,
          taskInventory,
          week,
          onToken,
          tenantId,
        );
      }

      const report = this.generateStaticReport(projectInfo, tasks, userMap, taskRows, taskInventory, week);
      return {
        success: true,
        output: report,
        skillId: this.id,
        tokensUsed: 0,
      };
    } catch (error) {
      console.error('周报生成（流式工具版）失败:', error);
      return {
        success: false,
        output: '周报生成失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /** 租户内全部项目的周报（忽略单项目 bizId；按固定简洁模板生成，不调用长文 LLM） */
  private async executePortfolioWeekly(_params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const { tenantId, onToken } = context;
    const week = this.getWeekRange(new Date());

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

      const output = buildConcisePortfolioWeeklyMarkdown(week, bundles);
      if (onToken) {
        onToken(output);
      }
      return {
        success: true,
        output,
        skillId: this.id,
        tokensUsed: Math.ceil(output.length / 4),
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

  private getWeekRange(now: Date): { startStr: string; endStr: string; label: string } {
    const d = new Date(now);
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (x: Date) => {
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2, '0');
      const dayN = String(x.getDate()).padStart(2, '0');
      return `${y}-${m}-${dayN}`;
    };
    const startStr = fmt(monday);
    const endStr = fmt(sunday);
    return { startStr, endStr, label: `${startStr} 至 ${endStr}` };
  }

  private taskStatusLabel(s: string | null): string {
    const m: Record<string, string> = { '0': '待开始', '1': '进行中', '2': '已完成', '3': '延期' };
    return m[s ?? '0'] ?? '未知';
  }

  private taskPriorityLabel(p: string | null): string {
    const m: Record<string, string> = { '0': '紧急', '1': '高', '2': '中', '3': '低' };
    return m[p ?? '1'] ?? '中';
  }

  private taskRiskLabel(r: string | null): string {
    const m: Record<string, string> = { '0': '无', '1': '低', '2': '中', '3': '高' };
    return m[r ?? '0'] ?? '无';
  }

  private formatTaskInventory(rows: TaskReportRow[], userMap: Map<string, string>): string {
    if (rows.length === 0) return '（暂无任务）';
    return rows
      .map((t, i) => {
        const assignee =
          t.assigneeUserId != null ? userMap.get(String(t.assigneeUserId)) ?? `用户${t.assigneeUserId}` : '未分配';
        const due = t.dueTime ? t.dueTime.toISOString().slice(0, 10) : '未设置';
        return `${i + 1}. [ID ${t.id}] ${t.taskName ?? '未命名'}｜${this.taskStatusLabel(t.status)}｜优先级 ${this.taskPriorityLabel(t.priority)}｜进度 ${Number(t.progress ?? 0).toFixed(0)}%｜截止 ${due}｜风险 ${this.taskRiskLabel(t.riskLevel)}｜负责人 ${assignee}`;
      })
      .join('\n');
  }

  private summarizeWeeklyProgressBlock(rows: TaskReportRow[], week: { startStr: string; endStr: string }): string {
    if (rows.length === 0) return '当前项目下暂无任务，可在任务看板创建后再生成周报。';
    const ws = new Date(week.startStr + 'T00:00:00');
    const we = new Date(week.endStr + 'T23:59:59');
    const dueInWeek = rows.filter((t) => t.dueTime && t.dueTime >= ws && t.dueTime <= we);
    const delayed = rows.filter((t) => t.status === '3');
    const inProgress = rows.filter((t) => t.status === '1');
    const todo = rows.filter((t) => t.status === '0');
    const done = rows.filter((t) => t.status === '2');
    const highRisk = rows.filter((t) => ['2', '3'].includes(t.riskLevel ?? '0'));
    const lines = [
      `- 任务分布：待开始 ${todo.length}，进行中 ${inProgress.length}，已完成 ${done.length}，已延期 ${delayed.length}。`,
      `- 截止日落在本周（${week.startStr}～${week.endStr}）的任务：${dueInWeek.length} 条。`,
      `- 标记为中/高风险：${highRisk.length} 条。`,
    ];
    if (dueInWeek.length > 0) {
      lines.push(
        '- 本周截止：' +
          dueInWeek
            .slice(0, 8)
            .map((t) => `「${t.taskName ?? t.id}」`)
            .join('、') +
          (dueInWeek.length > 8 ? ` 等共 ${dueInWeek.length} 条` : ''),
      );
    }
    return lines.join('\n');
  }

  private suggestNextWeekBullets(rows: TaskReportRow[]): string[] {
    const out: string[] = [];
    const delayed = rows.filter((t) => t.status === '3');
    const highRisk = rows.filter((t) => ['2', '3'].includes(t.riskLevel ?? '0'));
    const inProgress = rows.filter((t) => t.status === '1');
    if (delayed.length) {
      out.push(`消化 ${delayed.length} 条延期任务：与责任人确认新的目标完成日，并记录阻塞原因。`);
    }
    if (highRisk.length) {
      out.push(`对 ${highRisk.length} 条中高风险任务做逐条复盘，必要时下调范围或增加资源。`);
    }
    if (inProgress.length) {
      out.push(`跟进 ${inProgress.length} 条进行中任务的进度与依赖，避免临近截止才暴露风险。`);
    }
    const soon = rows.filter((t) => {
      if (!t.dueTime || t.status === '2') return false;
      const days = Math.ceil((t.dueTime.getTime() - Date.now()) / (86400 * 1000));
      return days >= 0 && days <= 7;
    });
    if (soon.length) {
      out.push(`未来 7 日内到期的任务共 ${soon.length} 条，建议排入下周计划并每日对齐。`);
    }
    if (out.length === 0) {
      out.push('结合里程碑检查下一阶段交付物，提前拆解任务并同步干系人。');
    }
    return out.slice(0, 6);
  }

  /**
   * 生成流式报告
   */
  private async generateStreamingReport(
    projectInfo: any,
    tasks: any[],
    userMap: Map<string, string>,
    taskRows: TaskReportRow[],
    taskInventory: string,
    week: { startStr: string; endStr: string; label: string },
    onToken: (token: string) => void,
    tenantId: string,
  ): Promise<SkillResult> {
    const prompt = this.buildReportPrompt(projectInfo, tasks, userMap, taskRows, taskInventory, week);

    try {
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
      const report = this.generateStaticReport(projectInfo, tasks, userMap, taskRows, taskInventory, week);
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
  private buildReportPrompt(
    projectInfo: any,
    tasks: any[],
    userMap: Map<string, string>,
    taskRows: TaskReportRow[],
    taskInventory: string,
    week: { startStr: string; endStr: string; label: string },
  ): string {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === '2').length;
    const inProgressTasks = tasks.filter((t) => t.status === '1').length;
    const delayedTasks = tasks.filter((t) => t.status === '3').length;
    const highRiskTasks = tasks.filter((t) => ['2', '3'].includes(t.riskLevel || '0')).length;
    const progressDigest = this.summarizeWeeklyProgressBlock(taskRows, week);

    return `你是项目经理。请严格根据下方「事实数据」写一份中文周报，禁止编造不存在的任务或数字。

【项目】${projectInfo.projectName}（ID ${projectInfo.id}）
【项目状态】${this.getProjectStatus(projectInfo.status)}
【整体进度】${Number(projectInfo.progress || 0).toFixed(0)}%
【计划周期】开始 ${projectInfo.startTime || '未设置'}，结束 ${projectInfo.endTime || '未设置'}

【自然周】${week.label}（用于理解「本周」）

【任务统计】
- 总数 ${totalTasks}；已完成 ${completedTasks}；进行中 ${inProgressTasks}；延期 ${delayedTasks}；中高风险 ${highRiskTasks}

【本周进度摘要（由系统根据截止日期与状态生成，请融入正文）】
${progressDigest}

【本项目任务全量清单】
${taskInventory}

章节要求（须全部覆盖，小标题可用 ##）：
1. 项目概览：项目名、状态、整体进度、计划起止
2. 本周工作进展：结合自然周与上表任务，说明本周应推进 / 已完成的工作（可引用任务 ID 或名称）
3. 风险与问题：延期任务、中高风险任务、临近截止（7 天内）任务及负责人
4. 下周计划建议：3～6 条可执行动作，必须与上表真实状态呼应，不要空话

语气简洁、可执行。`;
  }

  /**
   * 生成静态报告
   */
  private generateStaticReport(
    projectInfo: any,
    tasks: any[],
    userMap: Map<string, string>,
    taskRows: TaskReportRow[],
    taskInventory: string,
    week: { startStr: string; endStr: string; label: string },
  ): string {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === '2').length;
    const inProgressTasks = tasks.filter((t) => t.status === '1').length;
    const delayedTasks = tasks.filter((t) => t.status === '3').length;
    const highRiskTasks = tasks.filter((t) => ['2', '3'].includes(t.riskLevel || '0')).length;
    const nextWeek = this.suggestNextWeekBullets(taskRows);

    return `# ${projectInfo.projectName} 周报（流式工具版）

## 项目概览
- **项目名称**: ${projectInfo.projectName}（项目 ID: ${projectInfo.id}）
- **项目状态**: ${this.getProjectStatus(projectInfo.status)}
- **当前进度**: ${Number(projectInfo.progress || 0).toFixed(0)}%
- **开始时间**: ${projectInfo.startTime || '未设置'}
- **计划结束**: ${projectInfo.endTime || '未设置'}
- **本周范围**: ${week.label}

## 任务统计
- **任务总数**: ${totalTasks}
- **已完成**: ${completedTasks} (${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%)
- **进行中**: ${inProgressTasks}
- **延期**: ${delayedTasks}
- **中高风险任务**: ${highRiskTasks}

## 本周工作进展（数据摘要）
${this.summarizeWeeklyProgressBlock(taskRows, week)}

## 本项目任务清单
${taskInventory}

## 高优先级关注（P0/P1）
${this.generateWeeklyHighlights(tasks, userMap)}

## 风险与延期
${this.generateRiskAnalysis(tasks, userMap)}

## 下周计划建议
${nextWeek.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
*技能版本: 流式工具版（数据来自项目全量任务）*`;
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