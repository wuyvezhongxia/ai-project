import type { AiChatHost, ChatTurnState } from "../chat-host";
import type { AiResponse } from "../../core/ai.types";
import { tryExplicitModifyIntent } from "./explicit/explicit-modify-intent";
import { tryExplicitCreateOperations } from "./explicit/explicit-create";
import { tryExplicitModifyFields } from "./explicit/explicit-modify-fields";
import { tryExplicitViewDetail } from "./explicit/explicit-view-detail";

export async function runExplicitOperationsPhase(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  if (!s.isExplicitOperation) {
    return null;
  }
  const chain = [
    tryExplicitModifyIntent,
    tryExplicitCreateOperations,
    tryExplicitModifyFields,
    tryExplicitViewDetail,
  ] as const;
  for (const fn of chain) {
    const r = await fn(host, s);
    if (r) return r;
  }
  return null;
}
