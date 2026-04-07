import { prisma } from '../../../common/prisma';
import { toDbId } from '../../../common/db-values';
import type {
  IMemoryManager,
  MemoryType,
  SkillExecutionRecord,
  UserPreference,
  TenantKnowledge,
} from './memory.types';

/**
 * 基于数据库的三级记忆管理器
 */
export class MemoryManager implements IMemoryManager {
  // 会话记忆表名（使用现有ai_record表，但需要扩展）
  private readonly CONVERSATION_TABLE = 'ai_record';

  // 短期记忆过期时间（24小时）
  private readonly SHORT_TERM_EXPIRE_MS = 24 * 60 * 60 * 1000;

  // 中期记忆过期时间（30天）
  private readonly MEDIUM_TERM_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;

  /**
   * 记录对话内容到会话记忆
   */
  async recordConversation(
    sessionId: string,
    tenantId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    try {
      // 使用现有的ai_record表存储对话历史
      // 这里简化处理，实际项目中可能需要更结构化的存储
      const inputText = role === 'user' ? content : null;
      const outputText = role === 'assistant' ? content : null;

      await prisma.aiRecord.create({
        data: {
          tenantId,
          bizType: 'conversation',
          bizId: toDbId(sessionId),
          inputText,
          outputText,
          modelId: null,
          createBy: toDbId(userId),
          createTime: new Date(),
        },
      });

      // 同时更新用户偏好记忆（记录用户对话频率）
      await this.updateUserConversationStats(userId, tenantId);
    } catch (error) {
      console.error('记录对话失败:', error);
      // 失败不影响主流程
    }
  }

  /**
   * 获取会话历史
   */
  async getConversationHistory(
    sessionId: string,
    limit: number = 20
  ): Promise<Array<{ role: string; content: string }>> {
    try {
      // 这里简化：从ai_record表中获取最近的历史
      // 实际项目中可能需要根据sessionId查询
      const records = await prisma.aiRecord.findMany({
        where: {
          bizType: 'conversation',
          // bizId: toDbId(sessionId), // 暂时不按sessionId过滤
        },
        orderBy: { createTime: 'desc' },
        take: limit,
        select: {
          inputText: true,
          outputText: true,
          createTime: true,
        },
      });

      const history: Array<{ role: string; content: string }> = [];

      // 按时间顺序整理
      records.reverse().forEach(record => {
        if (record.inputText) {
          history.push({ role: 'user', content: record.inputText });
        }
        if (record.outputText) {
          history.push({ role: 'assistant', content: record.outputText });
        }
      });

      return history;
    } catch (error) {
      console.error('获取会话历史失败:', error);
      return [];
    }
  }

  /**
   * 记录技能执行
   */
  async recordSkillExecution(record: SkillExecutionRecord): Promise<void> {
    try {
      // 创建技能执行记录
      await prisma.aiRecord.create({
        data: {
          tenantId: record.tenantId,
          bizType: 'skill_execution',
          bizId: toDbId(record.skillId),
          inputText: record.input,
          outputText: typeof record.result === 'string'
            ? record.result
            : JSON.stringify(record.result),
          modelId: null,
          createBy: toDbId(record.userId),
          createTime: record.timestamp,
        },
      });

      // 更新用户技能使用统计
      await this.updateUserSkillStats(
        record.userId,
        record.tenantId,
        record.skillId,
        record.metadata?.success ?? true
      );

      // 更新租户技能知识
      await this.updateTenantSkillKnowledge(
        record.tenantId,
        record.skillId,
        record.input,
        record.result
      );
    } catch (error) {
      console.error('记录技能执行失败:', error);
    }
  }

  /**
   * 获取技能执行记录
   */
  async getSkillExecutions(
    userId: string,
    tenantId: string,
    skillId?: string,
    limit: number = 50
  ): Promise<SkillExecutionRecord[]> {
    try {
      const where: any = {
        tenantId,
        createBy: toDbId(userId),
        bizType: 'skill_execution',
      };

      if (skillId) {
        where.bizId = toDbId(skillId);
      }

      const records = await prisma.aiRecord.findMany({
        where,
        orderBy: { createTime: 'desc' },
        take: limit,
        select: {
          id: true,
          bizId: true,
          inputText: true,
          outputText: true,
          createTime: true,
          createBy: true,
        },
      });

      return records.map(record => ({
        skillId: record.bizId ? record.bizId.toString() : '',
        skillName: this.getSkillNameFromId(record.bizId?.toString() || ''),
        userId: record.createBy?.toString() || userId,
        tenantId,
        input: record.inputText || '',
        result: record.outputText || '',
        timestamp: record.createTime,
        metadata: {
          success: true,
        },
      }));
    } catch (error) {
      console.error('获取技能执行记录失败:', error);
      return [];
    }
  }

  /**
   * 记录用户偏好
   */
  async recordUserPreference(
    userId: string,
    tenantId: string,
    preference: UserPreference
  ): Promise<void> {
    try {
      // 检查是否已有记录
      const existing = await prisma.aiRecord.findFirst({
        where: {
          tenantId,
          createBy: toDbId(userId),
          bizType: 'user_preference',
        },
      });

      const preferenceData = JSON.stringify(preference);

      if (existing) {
        // 更新
        await prisma.aiRecord.update({
          where: { id: existing.id },
          data: {
            inputText: preferenceData,
            outputText: null,
            updateTime: new Date(),
          },
        });
      } else {
        // 创建
        await prisma.aiRecord.create({
          data: {
            tenantId,
            bizType: 'user_preference',
            bizId: null,
            inputText: preferenceData,
            outputText: null,
            modelId: null,
            createBy: toDbId(userId),
            createTime: new Date(),
          },
        });
      }
    } catch (error) {
      console.error('记录用户偏好失败:', error);
    }
  }

  /**
   * 获取用户偏好
   */
  async getUserPreferences(
    userId: string,
    tenantId: string
  ): Promise<UserPreference> {
    try {
      const record = await prisma.aiRecord.findFirst({
        where: {
          tenantId,
          createBy: toDbId(userId),
          bizType: 'user_preference',
        },
        orderBy: { createTime: 'desc' },
      });

      if (!record?.inputText) {
        return this.getDefaultUserPreferences();
      }

      try {
        return JSON.parse(record.inputText);
      } catch {
        return this.getDefaultUserPreferences();
      }
    } catch (error) {
      console.error('获取用户偏好失败:', error);
      return this.getDefaultUserPreferences();
    }
  }

  /**
   * 记录租户知识
   */
  async recordTenantKnowledge(
    tenantId: string,
    knowledge: TenantKnowledge
  ): Promise<void> {
    try {
      await prisma.aiRecord.create({
        data: {
          tenantId,
          bizType: 'tenant_knowledge',
          bizId: toDbId(knowledge.topic),
          inputText: knowledge.content,
          outputText: JSON.stringify({
            category: knowledge.category,
            source: knowledge.source,
            relevance: knowledge.relevance,
            metadata: knowledge.metadata,
          }),
          modelId: null,
          createBy: null, // 系统创建
          createTime: new Date(),
        },
      });
    } catch (error) {
      console.error('记录租户知识失败:', error);
    }
  }

  /**
   * 获取租户知识
   */
  async getTenantKnowledge(
    tenantId: string,
    topic?: string
  ): Promise<TenantKnowledge[]> {
    try {
      const where: any = {
        tenantId,
        bizType: 'tenant_knowledge',
      };

      if (topic) {
        where.bizId = toDbId(topic);
      }

      const records = await prisma.aiRecord.findMany({
        where,
        orderBy: { createTime: 'desc' },
        take: 100,
        select: {
          bizId: true,
          inputText: true,
          outputText: true,
          createTime: true,
        },
      });

      return records.map(record => {
        let metadata: any = {};
        try {
          metadata = record.outputText ? JSON.parse(record.outputText) : {};
        } catch {}

        return {
          topic: record.bizId ? record.bizId.toString() : '未知',
          content: record.inputText || '',
          category: metadata.category,
          source: metadata.source,
          relevance: metadata.relevance || 0.5,
          metadata: {
            createdBy: 'system',
            createdAt: record.createTime,
            verified: metadata.verified || false,
            usageCount: metadata.usageCount || 0,
          },
        };
      });
    } catch (error) {
      console.error('获取租户知识失败:', error);
      return [];
    }
  }

  /**
   * 私有方法：更新用户对话统计
   */
  private async updateUserConversationStats(
    userId: string,
    tenantId: string
  ): Promise<void> {
    // 简化实现：更新用户偏好中的对话统计
    try {
      const preferences = await this.getUserPreferences(userId, tenantId);

      if (!preferences.conversationStats) {
        preferences.conversationStats = {
          totalConversations: 0,
          lastConversationDate: new Date().toISOString(),
          averageMessagesPerSession: 0,
        };
      }

      preferences.conversationStats.totalConversations += 1;
      preferences.conversationStats.lastConversationDate = new Date().toISOString();

      await this.recordUserPreference(userId, tenantId, preferences);
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 私有方法：更新用户技能统计
   */
  private async updateUserSkillStats(
    userId: string,
    tenantId: string,
    skillId: string,
    success: boolean
  ): Promise<void> {
    try {
      const preferences = await this.getUserPreferences(userId, tenantId);

      if (!preferences.skillUsage) {
        preferences.skillUsage = {};
      }

      if (!preferences.skillUsage[skillId]) {
        preferences.skillUsage[skillId] = {
          totalUses: 0,
          successfulUses: 0,
          lastUsed: new Date().toISOString(),
        };
      }

      preferences.skillUsage[skillId].totalUses += 1;
      if (success) {
        preferences.skillUsage[skillId].successfulUses += 1;
      }
      preferences.skillUsage[skillId].lastUsed = new Date().toISOString();

      // 更新常用技能列表
      if (!preferences.preferredSkills) {
        preferences.preferredSkills = [];
      }

      if (!preferences.preferredSkills.includes(skillId)) {
        preferences.preferredSkills.push(skillId);
      }

      // 按使用频率排序
      preferences.preferredSkills.sort((a, b) => {
        const aUses = preferences.skillUsage?.[a]?.totalUses || 0;
        const bUses = preferences.skillUsage?.[b]?.totalUses || 0;
        return bUses - aUses;
      });

      // 保持前5个
      preferences.preferredSkills = preferences.preferredSkills.slice(0, 5);

      await this.recordUserPreference(userId, tenantId, preferences);
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 私有方法：更新租户技能知识
   */
  private async updateTenantSkillKnowledge(
    tenantId: string,
    skillId: string,
    input: string,
    result: any
  ): Promise<void> {
    // 简化实现：记录技能使用模式
    try {
      const topic = `skill_pattern_${skillId}`;
      const content = `输入: ${input}\n输出: ${typeof result === 'string' ? result : JSON.stringify(result)}`;

      const knowledge: TenantKnowledge = {
        topic,
        content,
        category: 'skill_pattern',
        source: 'system',
        relevance: 0.7,
        metadata: {
          createdBy: 'system',
          createdAt: new Date(),
          verified: true,
          usageCount: 1,
        },
      };

      await this.recordTenantKnowledge(tenantId, knowledge);
    } catch (error) {
      // 忽略错误
    }
  }

  /**
   * 私有方法：获取默认用户偏好
   */
  private getDefaultUserPreferences(): UserPreference {
    return {
      preferredSkills: ['weekly-report', 'batch-adjust', 'task-breakdown'],
      preferredModels: ['deepseek'],
      conversationStyle: 'casual',
      notificationPreferences: {
        email: true,
        push: false,
      },
      conversationStats: {
        totalConversations: 0,
        lastConversationDate: new Date().toISOString(),
        averageMessagesPerSession: 0,
      },
      skillUsage: {},
    };
  }

  /**
   * 私有方法：根据技能ID获取技能名称
   */
  private getSkillNameFromId(skillId: string): string {
    const map: Record<string, string> = {
      'weekly-report': '周报生成',
      'batch-adjust': '批量调整',
      'task-breakdown': '项目分析',
    };
    return map[skillId] || skillId;
  }
}

// 单例实例
let memoryManagerInstance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager();
  }
  return memoryManagerInstance;
}