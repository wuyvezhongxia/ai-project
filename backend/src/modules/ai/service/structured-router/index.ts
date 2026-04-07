export type { StructuredRouterResult } from "./schema";
export { StructuredRouterResultSchema } from "./schema";
export { STRUCTURED_ROUTING_CLARIFY_MESSAGE } from "./messages";
export { buildPendingContextBlock } from "./pending-context";
export { fetchStructuredRouterResult } from "./llm";
export { executeStructuredRouterResult } from "./execute";

export function buildSkillCatalogLines(
  skills: Array<{ id: string; name: string; description: string }>,
): string {
  if (skills.length === 0) return "(无启用技能)";
  return skills.map((s) => `- id=${s.id} | ${s.name} | ${s.description}`).join("\n");
}
