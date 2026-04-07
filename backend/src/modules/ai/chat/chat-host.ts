import type { AuthContext } from "../../../common/types";
import type { ChatParams } from "../core/ai.schemas";
import type {
  AiResponse,
  CreateTaskDraft,
  LlmMessage,
  PendingConfirmAction,
  PendingDeleteTaskBatch,
  PendingInferredAction,
  PendingProjectCreate,
  PendingStructuredInput,
  PendingSubtaskCreate,
  PendingTaskCreate,
  PendingTaskDisambiguation,
  PendingTaskModifyTarget,
} from "../core/ai.types";

/**
 * 可测试的 chat 宿主：把 AiService 上 pending Map 与 DB/LLM 相关方法桥接给分阶段函数。
 */
export type AiChatHost = {
  pendingTaskCreateMap: Map<string, PendingTaskCreate>;
  pendingProjectCreateMap: Map<string, PendingProjectCreate>;
  pendingSubtaskCreateMap: Map<string, PendingSubtaskCreate>;
  pendingDeleteTaskBatchMap: Map<string, PendingDeleteTaskBatch>;
  pendingConfirmActionMap: Map<string, PendingConfirmAction>;
  pendingTaskModifyTargetMap: Map<string, PendingTaskModifyTarget>;
  pendingInferredActionMap: Map<string, PendingInferredAction>;
  pendingStructuredInputMap: Map<string, PendingStructuredInput>;
  pendingTaskDisambiguationMap: Map<string, PendingTaskDisambiguation>;

  confirmAction(action: string, params: any, ctx: AuthContext): Promise<AiResponse>;
  createTaskFromDraft(
    ctx: AuthContext,
    inputBizId: string | undefined,
    draft: Pick<CreateTaskDraft, "title" | "projectName">,
    dueAt?: Date,
  ): Promise<{ id: string; taskName: string; projectId: string | null; projectName: string | null; status: string | null }>;
  resolveProject(
    ctx: AuthContext,
    inputBizId?: string,
    projectName?: string,
  ): Promise<{ id: bigint; projectName: string } | null>;
  createProjectByName(
    ctx: AuthContext,
    projectName: string,
  ): Promise<{ id: string; projectName: string; status: string | null; progress: string | null; existed: boolean }>;
  buildConversationMessages(ctx: AuthContext, bizId?: string): Promise<LlmMessage[]>;
  callDeepSeekChat(inputText: string, ctx: AuthContext, bizId?: string): Promise<{ output: string; tokensUsed: number }>;
  agentResultToAiResponse(agentResult: any, startedAt: number): AiResponse;
};

/** 单次 chat 轮次的快照（与原先 chat() 顶部局部变量一致） */
export type ChatTurnState = {
  startedAt: number;
  input: ChatParams;
  question: string;
  q: string;
  ctx: AuthContext;
  pendingKey: string;
  pendingProjectKey: string;
  pendingSubtaskKey: string;
  pendingDeleteBatchKey: string;
  pendingConfirmKey: string;
  pendingModifyKey: string;
  pendingInferKey: string;
  pendingStructuredKey: string;
  pendingTaskDisambiguationKey: string;
  pendingConfirm?: PendingConfirmAction;
  pendingDeleteBatch?: PendingDeleteTaskBatch;
  pendingCreate?: PendingTaskCreate;
  pendingProjectCreate?: PendingProjectCreate;
  pendingSubtaskCreate?: PendingSubtaskCreate;
  pendingStructured?: PendingStructuredInput;
  pendingTaskDisambiguation?: PendingTaskDisambiguation;
  pendingInferred?: PendingInferredAction;
  pendingModifyTarget?: PendingTaskModifyTarget;
  isExplicitOperation: boolean;
  /** 来自 LLM 规范化或流式入口注入：explicit 链未命中时不提示「信息不足」，交给下游路由 */
  relaxExplicitOperationFailure?: boolean;
  scopedProjectId: bigint | null;
  hasAlivePendingModify: boolean;
};
