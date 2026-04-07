import type { AuthContext } from "../../../common/types";

/** 与 AiService 各 pending Map 的 key 规则一致（tenantId:userId） */
export const aiPendingKey = (ctx: AuthContext) => `${ctx.tenantId}:${ctx.userId}`;
