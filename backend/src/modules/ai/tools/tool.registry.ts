import { StructuredTool } from '@langchain/core/tools';
import type { EnhancedContext } from '../skills/skill.types';

// 工具导入
import { createProjectQueryTool } from './query-tools/project-query.tool';
import { createTaskQueryTool } from './query-tools/task-query.tool';
import { createUserQueryTool } from './query-tools/user-query.tool';

/**
 * 工具注册表选项
 */
export interface ToolRegistrationOptions {
  enabled?: boolean;
  permissions?: string[];
  description?: string;
}

/**
 * 工具注册表项
 */
export interface ToolRegistryItem {
  tool: StructuredTool;
  name: string;
  description: string;
  enabled: boolean;
  permissions: string[];
}

/**
 * 工具注册表
 * 管理所有可用工具，支持按租户、用户权限过滤
 */
export class ToolRegistry {
  private tools: Map<string, ToolRegistryItem> = new Map();
  private enabledTools: Set<string> = new Set();

  constructor() {
    // 注册核心工具
    this.initializeCoreTools();
  }

  /**
   * 初始化核心工具
   */
  private initializeCoreTools(): void {
    // 项目查询工具
    this.register('project_query', createProjectQueryTool(), {
      description: '查询项目信息，支持按项目ID或名称关键词查询',
      permissions: ['project:read'],
    });

    // 任务查询工具
    this.register('task_query', createTaskQueryTool(), {
      description: '查询任务信息，支持按任务ID、名称、项目、负责人、状态等条件查询',
      permissions: ['task:read'],
    });

    // 用户查询工具
    this.register('user_query', createUserQueryTool(), {
      description: '查询用户信息，支持按用户ID、名称、部门等条件查询',
      permissions: ['user:read'],
    });

    console.log(`工具注册表初始化完成，已注册 ${this.tools.size} 个工具`);
  }

  /**
   * 注册工具
   */
  register(
    name: string,
    tool: StructuredTool,
    options: ToolRegistrationOptions = {}
  ): void {
    if (this.tools.has(name)) {
      console.warn(`工具已存在，将被覆盖: ${name}`);
    }

    const enabled = options.enabled ?? true;
    const permissions = options.permissions ?? [];

    this.tools.set(name, {
      tool,
      name,
      description: options.description || tool.description,
      enabled,
      permissions,
    });

    if (enabled) {
      this.enabledTools.add(name);
    }

    console.log(`工具注册成功: ${name} [${enabled ? '已启用' : '已禁用'}]`);
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    this.enabledTools.delete(name);

    if (removed) {
      console.log(`工具注销成功: ${name}`);
    }

    return removed;
  }

  /**
   * 启用工具
   */
  enableTool(name: string): boolean {
    const item = this.tools.get(name);
    if (!item) {
      console.warn(`无法启用不存在的工具: ${name}`);
      return false;
    }

    item.enabled = true;
    this.enabledTools.add(name);
    console.log(`工具已启用: ${name}`);
    return true;
  }

  /**
   * 禁用工具
   */
  disableTool(name: string): boolean {
    const disabled = this.enabledTools.delete(name);
    const item = this.tools.get(name);
    if (item) {
      item.enabled = false;
    }

    if (disabled) {
      console.log(`工具已禁用: ${name}`);
    }

    return disabled;
  }

  /**
   * 获取工具实例
   */
  getTool(name: string): StructuredTool | null {
    const item = this.tools.get(name);
    return item?.enabled ? item.tool : null;
  }

  /**
   * 获取所有工具
   */
  getAllTools(): StructuredTool[] {
    return Array.from(this.tools.values())
      .filter(item => item.enabled)
      .map(item => item.tool);
  }

  /**
   * 获取启用的工具名称列表
   */
  getEnabledToolNames(): string[] {
    return Array.from(this.enabledTools);
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 检查工具是否启用
   */
  isToolEnabled(name: string): boolean {
    return this.enabledTools.has(name);
  }

  /**
   * 根据用户权限过滤工具
   */
  getToolsForUser(userPermissions: string[]): StructuredTool[] {
    return Array.from(this.tools.values())
      .filter(item => {
        if (!item.enabled) return false;
        if (item.permissions.length === 0) return true;

        // 检查用户是否有至少一个所需权限
        return item.permissions.some(permission =>
          userPermissions.includes(permission)
        );
      })
      .map(item => item.tool);
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<string, number>;
  } {
    const total = this.tools.size;
    const enabled = this.enabledTools.size;
    const disabled = total - enabled;

    // 简单分类（根据名称前缀）
    const byCategory: Record<string, number> = {
      query: 0,
      action: 0,
      other: 0,
    };

    for (const [name] of this.tools) {
      if (name.includes('query')) {
        byCategory.query++;
      } else if (name.includes('create') || name.includes('update') || name.includes('delete')) {
        byCategory.action++;
      } else {
        byCategory.other++;
      }
    }

    return { total, enabled, disabled, byCategory };
  }

}

// 单例实例
let toolRegistryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    toolRegistryInstance = new ToolRegistry();
  }
  return toolRegistryInstance;
}