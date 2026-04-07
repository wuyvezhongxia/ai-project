import { SkillCategory, type ISkill } from "./skill.types";

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function assertSkillMetadata(skill: ISkill): void {
  const skillId = skill.id?.trim();
  if (!skillId) {
    throw new Error("[SkillRegistry] Skill.id 不能为空");
  }
  if (!ID_PATTERN.test(skillId)) {
    console.warn(
      `[SkillRegistry] Skill id 建议使用小写字母开头、仅含小写/数字/连字符: "${skillId}"（结构化路由 Prompt 依赖稳定 id）`,
    );
  }
  if (!skill.name?.trim()) {
    throw new Error(`[SkillRegistry] Skill「${skillId}」name 不能为空`);
  }
  const desc = skill.description?.trim() ?? "";
  if (desc.length < 4) {
    throw new Error(
      `[SkillRegistry] Skill「${skillId}」description 过短（至少 4 字），否则结构化路由难以正确选中该技能`,
    );
  }
}

/**
 * Skill 注册与启用状态管理。具名 Skill 的选用由结构化路由 LLM（skill_id）完成，不在此做意图匹配。
 */
export class SkillRegistry {
  private skills: Map<string, ISkill> = new Map();
  private enabledSkills: Set<string> = new Set();

  /**
   * 注册Skill
   */
  register(skill: ISkill, options?: { enabled?: boolean }): void {
    assertSkillMetadata(skill);
    const skillId = skill.id.trim();

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
   * 启动自检：所有已注册 Skill 元数据（注册时已校验，此处便于热重载后再次检查）
   */
  assertAllRegisteredSkillsMetadata(): void {
    for (const s of this.skills.values()) {
      assertSkillMetadata(s);
    }
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
