import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';
import { SkillRegistry } from './skill.registry';
import { getLLMManager } from '../llms/llm.manager';
import { getMemoryManager } from '../memory/memory.manager';
import { getToolRegistry } from '../tools/tool.registry';
import type { ISkill, SkillParams, SkillContext, SkillResult, AgentContext, AgentResult } from './skill.types';

// Skill实现导入
import { WeeklyReportSkill } from './implementations/analysis/weekly-report.skill';
import { WeeklyReportStreamingSkill } from './implementations/analysis/weekly-report-streaming.skill';
import { RiskAnalysisSkill } from './implementations/analysis/risk-analysis.skill';
import { TaskBreakdownSkill } from './implementations/generation/task-breakdown.skill';

/**
 * Skill路由器代理
 * 负责意图识别、Skill路由与执行
 */
export class SkillRouterAgent {
  private skillRegistry: SkillRegistry;
  private llmManager: ReturnType<typeof getLLMManager>;
  private memoryManager: ReturnType<typeof getMemoryManager>;
  private toolRegistry: ReturnType<typeof getToolRegistry>;

  constructor() {
    this.skillRegistry = new SkillRegistry();
    this.llmManager = getLLMManager();
    this.memoryManager = getMemoryManager();
    this.toolRegistry = getToolRegistry();

    // 注册核心Skill
    this.registerSkill(new WeeklyReportSkill());
    this.registerSkill(new WeeklyReportStreamingSkill());
    this.registerSkill(new RiskAnalysisSkill());
    this.registerSkill(new TaskBreakdownSkill());

    console.log('Skill路由器初始化完成，已注册', this.skillRegistry.getStats().enabled, '个Skill');
  }

  /**
   * 路由并执行用户请求
   */
  async routeAndExecute(
    userInput: string,
    context: AgentContext
  ): Promise<AgentResult> {
    try {
      // 1. 意图识别
      const intent = await this.identifyIntent(userInput, context);

      // 2. Skill发现
      const skill = this.skillRegistry.discoverSkill(intent, {
        userId: context.userId,
        tenantId: context.tenantId,
        conversationHistory: context.history,
      });

      if (skill) {
        // 3. 执行预定义Skill
        console.log(`执行Skill: ${skill.name} (${skill.id})`);
        return await this.executeSkill(skill, {
          input: userInput,
          ...context,
        });
      } else {
        // 4. 通用代理模式（动态组合Tools）
        console.log('使用通用代理处理');
        return await this.generalAgent(userInput, context);
      }
    } catch (error) {
      console.error('Skill路由执行失败:', error);
      return {
        success: false,
        output: 'AI处理失败，请稍后重试。',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 意图识别
   */
  private async identifyIntent(userInput: string, _context: AgentContext): Promise<string> {
    // 简化实现：返回用户输入作为意图
    // 实际项目中可以使用LLM进行意图分类
    return userInput;
  }

  /**
   * 执行Skill
   */
  private async executeSkill(
    skill: ISkill,
    params: SkillParams & SkillContext
  ): Promise<SkillResult> {
    // 检查确认要求
    if (skill.requiresConfirmation) {
      // 这里应该触发前端确认流程
      // 简化实现：直接继续执行
      console.log(`Skill ${skill.id} 需要确认，但当前跳过确认`);
    }

    const startTime = Date.now();

    try {
      // 执行Skill
      const result = await skill.execute(params, {
        userId: params.userId,
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        conversationHistory: params.conversationHistory,
        onToken: params.onToken,
      });

      // 更新记忆
      await this.memoryManager.recordSkillExecution({
        skillId: skill.id,
        skillName: skill.name,
        userId: params.userId,
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        input: params.input,
        result: result,
        timestamp: new Date(),
        metadata: {
          tokensUsed: result.tokensUsed || 0,
          duration: Date.now() - startTime,
          success: result.success,
        },
      });

      return result;
    } catch (error) {
      console.error(`Skill执行失败: ${skill.id}`, error);
      return {
        success: false,
        output: `Skill执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 通用代理处理（支持工具调用）
   */
  private async generalAgent(
    userInput: string,
    context: AgentContext
  ): Promise<AgentResult> {
    try {
      // 检查是否有可用的LLM模型
      const availableModels = this.llmManager.getAvailableModels();
      if (availableModels.length === 0) {
        // 没有可用的真实模型，返回规则引擎回复
        return this.fallbackToRuleEngine(userInput, context);
      }

      // 获取用户可用的工具（简化：假设用户有所有查询权限）
      const userPermissions = ['project:read', 'task:read', 'user:read']; // 简化权限
      const tools = this.toolRegistry.getToolsForUser(userPermissions);

      if (tools.length === 0) {
        // 没有可用工具，使用简单模式
        return await this.simpleChat(userInput, context);
      }

      // 使用DeepSeek API进行工具调用
      const llm = new ChatOpenAI({
        modelName: 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 2000,
      });

      // 绑定工具到LLM
      const llmWithTools = llm.bindTools(tools);

      // 构建系统提示
      const systemPrompt = this.buildToolSystemPrompt(context, tools);

      const messages = [
        new SystemMessage(systemPrompt),
        ...(context.history || []).map(msg =>
          msg.role === 'user'
            ? new HumanMessage(msg.content)
            : new SystemMessage(msg.content) // 注意：这里应该用AIMessage，但暂时用SystemMessage
        ),
        new HumanMessage(userInput),
      ];

      const startTime = Date.now();
      const response = await llmWithTools.invoke(messages);

      // 处理工具调用结果
      const { output, toolCalls, tokensUsed } = await this.processToolResponse(
        response,
        tools,
        { ...context, tenantFilter: { tenantId: context.tenantId } }
      );

      // 记录到记忆
      if (toolCalls && toolCalls.length > 0) {
        await this.memoryManager.recordSkillExecution({
          skillId: 'general_chat_with_tools',
          skillName: '通用对话（带工具）',
          userId: context.userId,
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          input: userInput,
          result: { output, toolCalls },
          timestamp: new Date(),
          metadata: {
            tokensUsed: tokensUsed || 0,
            duration: Date.now() - startTime,
            success: true,
          },
        });
      }

      return {
        success: true,
        output,
        skillUsed: 'general_chat_with_tools',
        skillId: 'general_chat_with_tools',
        toolCalls,
        tokensUsed,
      };
    } catch (error) {
      console.error('通用代理（工具调用）处理失败:', error);
      // 降级到简单聊天
      try {
        return await this.simpleChat(userInput, context);
      } catch (fallbackError) {
        console.error('降级聊天也失败:', fallbackError);
        return this.fallbackToRuleEngine(userInput, context);
      }
    }
  }

  /**
   * 简单聊天（无工具调用）
   */
  private async simpleChat(
    userInput: string,
    context: AgentContext
  ): Promise<AgentResult> {
    try {
      const llm = await this.llmManager.getLLMForTenant(context.tenantId);

      const systemPrompt = `你是任务管理系统的AI助手。当前用户ID：${context.userId}，租户ID：${context.tenantId}

请根据用户问题提供准确、有用的回答。遵循以下原则：
1. 基于真实数据回答，不要编造不存在的信息
2. 如果信息不足，明确说明需要哪些额外数据（如项目ID、任务ID）
3. 对于数据查询类问题，可以建议具体的查询方式
4. 对于操作类问题（创建、更新、删除），说明需要哪些参数
5. 保持回答简洁、实用、可执行`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...(context.history || []).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: userInput },
      ];

      const response = await llm.invoke(messages);
      const output = (response as any).content as string;
      const tokensUsed = Math.ceil(output.length / 4) + Math.ceil(userInput.length / 4);

      return {
        success: true,
        output,
        skillUsed: 'general_chat',
        tokensUsed,
      };
    } catch (error) {
      console.error('简单聊天处理失败:', error);
      return this.fallbackToRuleEngine(userInput, context);
    }
  }

  /**
   * 构建工具调用的系统提示
   */
  private buildToolSystemPrompt(context: AgentContext, tools: StructuredTool[]): string {
    const toolDescriptions = tools.map(tool =>
      `- ${tool.name}: ${tool.description}`
    ).join('\n');

    return `你是任务管理系统的AI助手，拥有访问项目、任务、用户等数据的权限。

系统数据结构：
1. 项目表 (pm_project)：id, projectName, ownerUserId, status, startTime, endTime, progress
2. 任务表 (pm_task)：id, taskName, assigneeUserId, status, priority, dueTime, riskLevel, progress
3. 用户表 (sys_user)：userId, nickName, deptId

当前用户ID：${context.userId}，租户ID：${context.tenantId}

你可以使用以下工具查询真实数据：
${toolDescriptions}

使用指南：
1. 优先使用工具查询真实数据，而不是猜测
2. 如果用户问题需要具体数据，请调用相应工具
3. 工具调用后，结合工具返回的数据给出回答
4. 保持回答简洁、实用、可执行
5. 如果信息不足，可以询问用户更多细节

重要：不要编造不存在的信息，必须基于工具查询结果回答。`;
  }

  /**
   * 处理工具响应
   */
  private async processToolResponse(
    response: any,
    tools: StructuredTool[],
    context: any
  ): Promise<{ output: string; toolCalls?: any[]; tokensUsed?: number }> {
    let output = '';
    const toolCalls: any[] = [];
    let tokensUsed = 0;

    // 检查是否有工具调用
    const toolCallArgs = response.tool_calls || response.additional_kwargs?.tool_calls;

    if (toolCallArgs && toolCallArgs.length > 0) {
      // 处理每个工具调用
      for (const toolCall of toolCallArgs) {
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;

        const tool = tools.find(t => t.name === toolName);
        if (!tool) {
          console.warn(`未知工具: ${toolName}`);
          continue;
        }

        try {
          const toolStartTime = Date.now();
          const toolResult = await tool.invoke(toolArgs, context);
          const toolDuration = Date.now() - toolStartTime;

          toolCalls.push({
            toolName,
            input: JSON.stringify(toolArgs),
            output: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            duration: toolDuration,
          });

          // 将工具结果添加到输出
          output += `工具 ${toolName} 查询结果：\n${toolResult}\n\n`;
        } catch (toolError) {
          console.error(`工具调用失败: ${toolName}`, toolError);
          toolCalls.push({
            toolName,
            input: JSON.stringify(toolArgs),
            output: `工具调用失败: ${toolError instanceof Error ? toolError.message : '未知错误'}`,
            duration: 0,
            error: true,
          });
        }
      }

      // 如果有工具调用，让LLM总结结果
      if (toolCalls.length > 0) {
        const summaryPrompt = `基于以下工具查询结果，请给出简洁、有用的回答：\n\n${output}\n\n用户原始问题是什么？请根据这些数据回答。`;

        const llm = await this.llmManager.getLLMForTenant(context.tenantId);
        const summaryResponse = await llm.invoke([
          { role: 'system', content: '请根据工具查询结果，给出简洁、有用的回答。' },
          { role: 'user', content: summaryPrompt },
        ]);

        output = (summaryResponse as any).content as string;
      }
    } else {
      // 没有工具调用，直接返回LLM响应
      output = (response as any).content as string || '';
    }

    // 估算token使用
    tokensUsed = Math.ceil(output.length / 4);

    return { output, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, tokensUsed };
  }

  /**
   * 规则引擎回退（当LLM不可用时使用）
   */
  private fallbackToRuleEngine(
    userInput: string,
    _context: AgentContext
  ): AgentResult {
    const lowerInput = userInput.toLowerCase();

    // 简单规则匹配
    if (lowerInput.includes('项目') && (lowerInput.includes('多少') || lowerInput.includes('几个'))) {
      return {
        success: true,
        output: '你可以使用系统的项目查询功能查看具体项目数量。当前会话中未指定具体项目范围。',
        skillUsed: 'rule_engine',
      };
    }

    if (lowerInput.includes('任务') && lowerInput.includes('状态')) {
      return {
        success: true,
        output: '任务状态包括：待开始、进行中、已完成、延期。您可以通过任务列表查看具体任务状态。',
        skillUsed: 'rule_engine',
      };
    }

    if (lowerInput.includes('风险') || lowerInput.includes('延期')) {
      return {
        success: true,
        output: '风险分析需要具体任务ID。您可以打开任务详情，使用"风险分析"快捷功能。',
        skillUsed: 'rule_engine',
      };
    }

    if (lowerInput.includes('周报') || lowerInput.includes('报告')) {
      return {
        success: true,
        output: '周报生成需要项目ID。请在AI助手面板顶部选择关联项目，然后点击"生成周报"按钮。',
        skillUsed: 'rule_engine',
      };
    }

    // 默认回复
    return {
      success: true,
      output: `已收到您的查询："${userInput}"。当前AI功能基于规则引擎，建议使用以下快捷功能：
1. 生成周报 - 需要选择关联项目
2. 风险分析 - 需要在任务详情页使用
3. 任务拆解 - 描述任务即可获得拆解建议
4. 项目进度 - 需要选择关联项目

或者，请配置DeepSeek API密钥以启用智能对话功能。`,
      skillUsed: 'rule_engine',
    };
  }

  /**
   * 注册Skill
   */
  registerSkill(skill: ISkill, options?: { enabled?: boolean }): void {
    this.skillRegistry.register(skill, options);
  }

  /**
   * 获取Skill注册器（用于前端获取Skill列表）
   */
  getSkillRegistry(): SkillRegistry {
    return this.skillRegistry;
  }
}

// 单例实例
let skillRouterAgentInstance: SkillRouterAgent | null = null;

export function getSkillRouterAgent(): SkillRouterAgent {
  if (!skillRouterAgentInstance) {
    skillRouterAgentInstance = new SkillRouterAgent();
  }
  return skillRouterAgentInstance;
}