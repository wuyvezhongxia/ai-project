export interface AiResponse {
  success: boolean;
  output: string;
  insight?: {
    summary: string;
    risks: string[];
    blockers: string[];
    nextActions: Array<{
      action: string;
      owner?: string;
      due?: string;
      priority?: "high" | "medium" | "low";
    }>;
    todayChecklist: string[];
    confidence?: number;
  };
  suggestions?: string[];
  metadata?: {
    model: string;
    tokensUsed: number;
    responseTime: number;
  };
  requiresConfirmation?: boolean;
  confirmationData?: {
    action: string;
    params: any;
    message: string;
  };
  error?: string;
}

export type AiMetadata = NonNullable<AiResponse["metadata"]>;
export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type CreateTaskDraft = {
  title: string;
  projectName?: string;
  dueAt?: Date;
};

export type UpdateTaskStatusTarget = {
  raw: string;
  coreName: string;
  status: "0" | "1" | "2" | "3";
};

export type UpdateTaskPriorityTarget = {
  raw: string;
  coreName: string;
  priority: "0" | "1" | "2" | "3";
};

export type UpdateTaskDueTarget = {
  raw: string;
  coreName: string;
  dueAt: Date | null;
};

export type MoveTaskToProjectTarget = {
  taskRaw: string;
  taskCoreName: string;
  projectRaw: string;
  projectCoreName: string;
};

export type ViewTaskDetailTarget = {
  raw: string;
  coreName: string;
  projectHint?: string;
  statusHint?: string;
};

export type PendingTaskCreate = {
  title?: string;
  projectName?: string;
  bizId?: string;
  requestedAt: number;
};

export type PendingProjectCreate = {
  requestedAt: number;
};

export type PendingSubtaskCreate = {
  requestedAt: number;
};

export type PendingDeleteTaskBatch = {
  taskIds: string[];
  taskNames: string[];
  requestedAt: number;
};

/** 任务条件检索命中多条：等待用户选序号或标题 */
export type PendingTaskDisambiguation = {
  op: string;
  routerArgs: Record<string, unknown>;
  candidates: Array<{
    id: string;
    taskName: string;
    status: string | null;
    projectName?: string;
  }>;
  requestedAt: number;
};

export type PendingConfirmAction = {
  action: string;
  params: Record<string, unknown>;
  requestedAt: number;
};

export type PendingTaskModifyTarget = {
  raw: string;
  coreName: string;
  requestedAt: number;
};

export type PendingInferredAction =
  | {
      action: "createTask";
      title: string;
      dueAt?: Date;
      bizId?: string;
      sourceText: string;
    }
  | {
      action: "createProject";
      projectName: string;
      sourceText: string;
    };

export type PendingStructuredInput = {
  first: string;
  mention?: string;
  dueAt?: Date;
  sourceText: string;
  requestedAt: number;
};
