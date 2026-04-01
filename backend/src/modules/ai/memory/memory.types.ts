/**
 * 记忆类型枚举
 */
export enum MemoryType {
  SHORT_TERM = 'short_term',  // 短期记忆：会话级别，临时存储
  MEDIUM_TERM = 'medium_term', // 中期记忆：用户级别，存储用户偏好和习惯
  LONG_TERM = 'long_term',    // 长期记忆：租户级别，存储组织知识和最佳实践
}

/**
 * 记忆内容接口
 */
export interface MemoryContent {
  id?: string;
  type: MemoryType;
  tenantId: string;
  userId?: string;           // 用户级记忆需要
  sessionId?: string;        // 会话级记忆需要
  key: string;               // 记忆键，如 "conversation_history", "user_preferences"
  value: any;                // 记忆值，结构化数据
  metadata?: {
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;        // 过期时间，短期记忆可设置
    accessCount: number;     // 访问次数
    lastAccessed: Date;      // 最后访问时间
  };
}

/**
 * 记忆查询选项
 */
export interface MemoryQueryOptions {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  type?: MemoryType;
  key?: string;
  limit?: number;
  offset?: number;
}

/**
 * 记忆存储接口
 */
export interface IMemoryStore {
  // 存储记忆
  store(memory: MemoryContent): Promise<void>;

  // 检索记忆
  retrieve(query: MemoryQueryOptions): Promise<MemoryContent[]>;

  // 更新记忆
  update(memory: Partial<MemoryContent> & { id: string }): Promise<void>;

  // 删除记忆
  delete(query: MemoryQueryOptions): Promise<number>;

  // 清空过期记忆
  clearExpired(): Promise<number>;
}

/**
 * 记忆管理器接口
 */
export interface IMemoryManager {
  // 会话记忆
  recordConversation(sessionId: string, tenantId: string, userId: string,
                     role: 'user' | 'assistant', content: string): Promise<void>;
  getConversationHistory(sessionId: string, limit?: number): Promise<Array<{ role: string; content: string }>>;

  // 技能执行记忆
  recordSkillExecution(record: SkillExecutionRecord): Promise<void>;
  getSkillExecutions(userId: string, tenantId: string, skillId?: string, limit?: number): Promise<SkillExecutionRecord[]>;

  // 用户偏好记忆
  recordUserPreference(userId: string, tenantId: string, preference: UserPreference): Promise<void>;
  getUserPreferences(userId: string, tenantId: string): Promise<UserPreference>;

  // 租户知识记忆
  recordTenantKnowledge(tenantId: string, knowledge: TenantKnowledge): Promise<void>;
  getTenantKnowledge(tenantId: string, topic?: string): Promise<TenantKnowledge[]>;
}

/**
 * 技能执行记录
 */
export interface SkillExecutionRecord {
  skillId: string;
  skillName: string;
  userId: string;
  tenantId: string;
  sessionId?: string;
  input: string;
  result: any;
  timestamp: Date;
  metadata?: {
    tokensUsed?: number;
    duration?: number;
    success: boolean;
  };
}

/**
 * 用户偏好
 */
export interface UserPreference {
  preferredSkills?: string[];      // 常用技能
  preferredModels?: string[];      // 偏好模型
  conversationStyle?: 'casual' | 'formal' | 'technical';
  notificationPreferences?: {
    email: boolean;
    push: boolean;
  };
  // 其他自定义偏好
  [key: string]: any;
}

/**
 * 租户知识
 */
export interface TenantKnowledge {
  topic: string;
  content: string;
  category?: string;
  source?: string;
  relevance: number; // 相关性得分 0-1
  metadata?: {
    createdBy: string;
    createdAt: Date;
    verified: boolean;
    usageCount: number;
  };
}