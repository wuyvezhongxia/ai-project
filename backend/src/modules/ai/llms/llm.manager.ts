import { ChatOpenAI } from '@langchain/openai';
import { type BaseLLM } from '@langchain/core/language_models/llms';
import { env } from '../../../config/env';
import type { LLMConfig } from '../skills/skill.types';

/**
 * LLM管理器
 * 支持DeepSeek、豆包等多种模型，按租户配置动态选择
 */
export class LLMManager {
  private providers: Map<string, any> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * 初始化模型提供者
   */
  private initializeProviders(): void {
    // 注册DeepSeek提供者
    if (env.DEEPSEEK_API_KEY) {
      const deepSeekLLM = new ChatOpenAI({
        apiKey: env.DEEPSEEK_API_KEY,
        modelName: env.DEEPSEEK_MODEL,
        configuration: {
          baseURL: env.DEEPSEEK_BASE_URL,
        },
        temperature: 0.3,
        maxTokens: env.AI_MAX_TOKENS_PER_REQUEST,
        timeout: env.AI_REQUEST_TIMEOUT,
      });
      this.providers.set('deepseek', deepSeekLLM);
      console.log('DeepSeek LLM 提供者已注册');
    }

    // 豆包（Doubao）提供者预留
    // 需要安装相应的SDK和配置
    // if (env.DOUBAO_API_KEY) {
    //   this.providers.set('doubao', new DoubaoLLM(config));
    // }
  }

  /**
   * 注册自定义模型提供者
   */
  register(name: string, llm: BaseLLM): void {
    this.providers.set(name, llm);
    console.log(`LLM 提供者已注册: ${name}`);
  }

  /**
   * 根据模型名称获取LLM实例
   */
  async getLLM(modelName: string = 'deepseek'): Promise<any> {
    const llm = this.providers.get(modelName);
    if (!llm) {
      throw new Error(`LLM 提供者不存在: ${modelName}`);
    }
    return llm;
  }

  /**
   * 根据租户配置获取LLM实例
   * 这里简化实现，实际项目中需要查询租户的模型配置
   */
  async getLLMForTenant(tenantId: string): Promise<any> {
    // 实际项目中，这里应该查询租户的模型配置
    // const tenantConfig = await getTenantLLMConfig(tenantId);
    // const modelName = tenantConfig.modelName || 'deepseek';

    // 简化：默认使用DeepSeek
    const modelName = 'deepseek';
    return this.getLLM(modelName);
  }

  /**
   * 获取所有可用的模型名称
   */
  getAvailableModels(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 检查模型是否可用
   */
  isModelAvailable(modelName: string): boolean {
    return this.providers.has(modelName);
  }
}

// 单例实例
let llmManagerInstance: LLMManager | null = null;

export function getLLMManager(): LLMManager {
  if (!llmManagerInstance) {
    llmManagerInstance = new LLMManager();
  }
  return llmManagerInstance;
}