import type { AiChatHost, ChatTurnState } from "../../chat-host";
import type { AiResponse } from "../../../core/ai.types";
import { handlePendingConfirm } from "./pending-confirm";
import { handlePendingTaskDisambiguation } from "./pending-task-disambiguation";
import { handlePendingDeleteBatch } from "./pending-delete-batch";
import { handlePendingTaskCreate } from "./pending-task-create";
import { handlePendingProjectCreate } from "./pending-project-create";
import { handlePendingSubtaskCreate } from "./pending-subtask-create";
import { handlePendingStructuredConfirmTask } from "./pending-structured-confirm-task";
import { handlePendingInferred } from "./pending-inferred";

export async function runChatPendingPhases(
  host: AiChatHost,
  s: ChatTurnState,
): Promise<AiResponse | null> {
  const chain = [
    handlePendingConfirm,
    handlePendingTaskDisambiguation,
    handlePendingDeleteBatch,
    handlePendingTaskCreate,
    handlePendingProjectCreate,
    handlePendingSubtaskCreate,
    handlePendingStructuredConfirmTask,
    handlePendingInferred,
  ] as const;
  for (const fn of chain) {
    const r = await fn(host, s);
    if (r) return r;
  }
  return null;
}
