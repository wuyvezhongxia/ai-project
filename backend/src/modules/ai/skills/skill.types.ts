type SkillToolLike = {
  name?: string;
};

type SkillChainLike = {
  name?: string;
};

type SkillPromptLike = {
  template?: string;
};

/**
 * Skill分类
 */
export enum SkillCategory {
  ANALYSIS = "analysis",      // 分析类：周报、风险分析
  GENERATION = "generation",  // 生成类：任务拆解、文档生成
  AUTOMATION = "automation",  // 自动化：批量操作、定时任务
  CUSTOM = "custom",          // 自定义Skill
}

/**
 * Skill上下文
 */
export interface SkillContext {
  userId: string;
  tenantId: string;
  sessionId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  onToken?: (token: string) => void;
  [key: string]: any;
}

/**
 * Skill参数
 */
export interface SkillParams {
  input: string;
  [key: string]: any;
}

/**
 * Skill结果
 */
export interface SkillResult {
  success: boolean;
  output: string;
  data?: any;
  requiresConfirmation?: boolean;
  confirmationData?: {
    action: string;
    params: any;
    message: string;
  };
  skillId?: string;
  toolCalls?: Array<{
    toolName: string;
    input: string;
    output: string;
    duration: number;
  }>;
  tokensUsed?: number;
  error?: string;
}

/**
 * Skill接口定义
 */
export interface ISkill {
  id: string;                    // 唯一标识，如 "weekly-report"
  name: string;                  // 用户友好的名称，如 "周报生成"
  description: string;           // 功能描述
  icon: string;                  // 图标，如 "📊"
  category: SkillCategory;       // 分类

  // Skill配置
  requiresConfirmation: boolean; // 危险操作标记（如删除操作）
  supportsStreaming: boolean;    // 支持流式输出
  availableModels: string[];     // 支持的LLM，如 ["deepseek", "doubao"]

  // 执行接口
  execute(params: SkillParams, context: SkillContext): Promise<SkillResult>;

  // 内部实现（对外透明）
  tools: SkillToolLike[];        // 使用的底层工具
  chains: SkillChainLike[];      // 执行链
  prompts: SkillPromptLike[];    // 提示模板
}

/**
 * Skill注册选项
 */
export interface SkillRegistrationOptions {
  skill: ISkill;
  enabled?: boolean;
  permissions?: string[];  // 需要的权限
}

/**
 * Skill发现上下文
 */
export interface SkillDiscoveryContext {
  userId: string;
  tenantId: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  availableSkills?: string[];  // 用户可用的Skill列表
}

/**
 * Agent上下文
 */
export interface AgentContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  history?: Array<{ role: string; content: string }>;
  onToken?: (token: string) => void;
  [key: string]: any;
}

/**
 * Agent结果
 */
export interface AgentResult {
  success: boolean;
  output: string;
  skillUsed?: string;
  skillId?: string;
  toolCalls?: Array<{
    toolName: string;
    input: string;
    output: string;
    duration: number;
  }>;
  tokensUsed?: number;
  error?: string;
}

/**
 * LLM配置
 */
export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * 工具上下文
 */
export interface ToolContext {
  userId: string;
  tenantId: string;
  sessionId?: string;
  [key: string]: any;
}

/**
 * 增强上下文（带租户过滤）
 */
export interface EnhancedContext extends ToolContext {
  tenantFilter: { tenantId: string };
}
