import type { ToolRunnableConfig } from '@langchain/core/tools';
import type { EnhancedContext } from '../../skills/skill.types';

/** Second argument to `StructuredTool.invoke` — keeps typings valid and matches `_call` parentConfig. */
export function toolRunnableConfigFromEnhancedContext(ctx: EnhancedContext): ToolRunnableConfig {
  return {
    configurable: {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      sessionId: ctx.sessionId,
      tenantFilter: ctx.tenantFilter,
    },
  };
}

/**
 * LangChain passes session config as the third argument to `_call` (parentConfig), not the second.
 * Values may be on `configurable` (from `toolRunnableConfigFromEnhancedContext`) or top-level (e.g. skill router).
 */
export function enhancedContextFromToolConfig(
  parentConfig: ToolRunnableConfig | undefined
): EnhancedContext | null {
  if (!parentConfig || typeof parentConfig !== 'object') return null;
  const c = parentConfig as Record<string, unknown>;
  const conf =
    c.configurable && typeof c.configurable === 'object'
      ? (c.configurable as Record<string, unknown>)
      : {};
  const tenantId = (c.tenantId ?? conf.tenantId) as string | undefined;
  const userId = (c.userId ?? conf.userId) as string | undefined;
  const sessionId = (c.sessionId ?? conf.sessionId) as string | undefined;
  const tenantFilterRaw = c.tenantFilter ?? conf.tenantFilter;
  const tenantFilter =
    tenantFilterRaw &&
    typeof tenantFilterRaw === 'object' &&
    tenantFilterRaw !== null &&
    'tenantId' in tenantFilterRaw &&
    typeof (tenantFilterRaw as { tenantId: unknown }).tenantId === 'string'
      ? (tenantFilterRaw as { tenantId: string })
      : tenantId
        ? { tenantId }
        : undefined;
  if (!tenantId || !userId || !tenantFilter) return null;
  return { userId, tenantId, sessionId, tenantFilter };
}
