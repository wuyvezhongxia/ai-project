import { SkillCategory, type ISkill, type SkillDiscoveryContext } from "./skill.types";

/**
 * Skill注册与发现管理器
 */
export class SkillRegistry {
  private skills: Map<string, ISkill> = new Map();
  private enabledSkills: Set<string> = new Set();

  /**
   * 注册Skill
   */
  register(skill: ISkill, options?: { enabled?: boolean }): void {
    const skillId = skill.id;

    if (this.skills.has(skillId)) {
      console.warn(`Skill已存在，将被覆盖: ${skillId}`);
    }

    this.skills.set(skillId, skill);

    // 默认启用
    const enabled = options?.enabled ?? true;
    if (enabled) {
      this.enabledSkills.add(skillId);
    }

    console.log(`Skill注册成功: ${skill.name} (${skillId}) [${enabled ? '已启用' : '已禁用'}]`);
  }

  /**
   * 注销Skill
   */
  unregister(skillId: string): boolean {
    const removed = this.skills.delete(skillId);
    this.enabledSkills.delete(skillId);

    if (removed) {
      console.log(`Skill注销成功: ${skillId}`);
    }

    return removed;
  }

  /**
   * 启用Skill
   */
  enableSkill(skillId: string): boolean {
    if (!this.skills.has(skillId)) {
      console.warn(`无法启用不存在的Skill: ${skillId}`);
      return false;
    }

    this.enabledSkills.add(skillId);
    console.log(`Skill已启用: ${skillId}`);
    return true;
  }

  /**
   * 禁用Skill
   */
  disableSkill(skillId: string): boolean {
    const disabled = this.enabledSkills.delete(skillId);

    if (disabled) {
      console.log(`Skill已禁用: ${skillId}`);
    }

    return disabled;
  }

  /**
   * 根据意图发现Skill（关键词匹配）
   */
  discoverSkill(intent: string, context: SkillDiscoveryContext): ISkill | null {
    // 只返回启用的Skill
    const enabledSkillIds = Array.from(this.enabledSkills);
    const enabledSkills = enabledSkillIds
      .map(id => this.skills.get(id)!)
      .filter(Boolean);

    // 1. 关键词匹配
    const keywordMatch = this.matchByKeywords(intent, enabledSkills);
    if (keywordMatch) {
      // 检查用户是否有权限
      if (this.hasPermission(keywordMatch, context.userId, context.tenantId)) {
        return keywordMatch;
      }
    }

    // 2. 无匹配，返回null（将由通用代理处理）
    return null;
  }

  /**
   * 关键词匹配
   */
  private matchByKeywords(intent: string, skills: ISkill[]): ISkill | null {
    const keywords: Record<string, string[]> = {
      // 周报相关
      "周报": ["weekly-report", "report", "summary"],
      "工作报告": ["weekly-report", "report"],
      "工作总结": ["weekly-report", "summary"],
      "工作周报": ["weekly-report"],
      "weekly": ["weekly-report"],
      "report": ["weekly-report"],
      "summary": ["weekly-report"],

      // 风险相关
      "风险": ["risk-analysis", "risk"],
      "延期": ["risk-analysis", "delay"],
      "危险": ["risk-analysis"],
      "风险评估": ["risk-analysis"],
      "风险分析": ["risk-analysis"],

      // 任务拆解
      "拆解": ["task-breakdown", "breakdown"],
      "分解": ["task-breakdown"],
      "子任务": ["task-breakdown", "subtask"],
      "breakdown": ["task-breakdown"],
      "拆任务": ["task-breakdown"],

      // 负载分析（暂未实现）
      "负载": ["workload-analysis", "workload"],
      "工作量": ["workload-analysis"],
      "团队": ["workload-analysis", "team"],

      // 项目进度
      "进度": ["project-progress", "progress"],
      "项目进度": ["project-progress"],
      "项目": ["project-progress", "project"],
      "健康度": ["project-progress"],
      "progress": ["project-progress"],

      // 任务洞察（暂未实现，映射到通用聊天）
      "洞察": ["general-chat"],
      "insight": ["general-chat"],
      "任务洞察": ["general-chat"],
    };

    // 查找匹配的关键词
    for (const [keyword, skillIds] of Object.entries(keywords)) {
      if (intent.includes(keyword)) {
        for (const skillId of skillIds) {
          const skill = skills.find(s => s.id === skillId);
          if (skill) {
            return skill;
          }
        }
      }
    }

    return null;
  }

  /**
   * 权限检查（简化版，可根据实际需求扩展）
   */
  private hasPermission(skill: ISkill, userId: string, tenantId: string): boolean {
    // 这里可以根据用户角色、部门、租户配置等进行验证
    // 目前返回true，实际项目中需要实现具体的权限逻辑
    return true;
  }

  /**
   * 获取所有Skill
   */
  getAllSkills(): ISkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取启用的Skill
   */
  getEnabledSkills(): ISkill[] {
    return Array.from(this.enabledSkills)
      .map(id => this.skills.get(id)!)
      .filter(Boolean);
  }

  /**
   * 根据分类获取Skill
   */
  getSkillsByCategory(category: SkillCategory): ISkill[] {
    return this.getEnabledSkills()
      .filter(skill => skill.category === category);
  }

  /**
   * 根据ID获取Skill
   */
  getSkill(skillId: string): ISkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * 检查Skill是否存在
   */
  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * 检查Skill是否启用
   */
  isSkillEnabled(skillId: string): boolean {
    return this.enabledSkills.has(skillId);
  }

  /**
   * 获取Skill统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<SkillCategory, number>;
  } {
    const total = this.skills.size;
    const enabled = this.enabledSkills.size;
    const disabled = total - enabled;

    const byCategory: Record<SkillCategory, number> = {
      [SkillCategory.ANALYSIS]: 0,
      [SkillCategory.GENERATION]: 0,
      [SkillCategory.AUTOMATION]: 0,
      [SkillCategory.CUSTOM]: 0,
    };

    for (const skill of this.skills.values()) {
      byCategory[skill.category]++;
    }

    return { total, enabled, disabled, byCategory };
  }
}
