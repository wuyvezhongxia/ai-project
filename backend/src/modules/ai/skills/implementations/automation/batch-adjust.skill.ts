import { isNumericId, toTaskStatus } from "../../../core/ai.domain-format";
import { planProjectBatchStatusAdjust } from "../../../services/batch-adjust-project.service";
import type { ISkill, SkillParams, SkillContext, SkillResult } from "../../skill.types";
import { SkillCategory } from "../../skill.types";
import type { AuthContext } from "../../../../../common/types";

/**
 * 关联项目下按自然语言筛选任务并批量修改状态（执行前经对话确认）。
 */
export class BatchAdjustSkill implements ISkill {
  id = "batch-adjust";
  name = "批量调整";
  description =
    "在已关联项目下按自然语言筛选任务并批量修改状态（如待开始改进行中）；先展示影响范围，用户确认后再写入";
  icon = "📦";
  category = SkillCategory.AUTOMATION;
  requiresConfirmation = false;
  supportsStreaming = false;
  availableModels = ["deepseek", "doubao"];

  tools = [];
  chains = [];
  prompts = [];

  private authFromContext(context: SkillContext): AuthContext {
    return {
      userId: context.userId,
      tenantId: context.tenantId,
      roleIds: Array.isArray(context.roleIds) ? context.roleIds : [],
      deptId: typeof context.deptId === "string" ? context.deptId : undefined,
    };
  }

  async execute(params: SkillParams, context: SkillContext): Promise<SkillResult> {
    const input = params.input?.trim() ?? "";
    const projectId = context.bizId;

    if (!projectId || !isNumericId(projectId)) {
      return {
        success: true,
        output: "请先选择关联项目。",
        skillId: this.id,
      };
    }

    const ctx = this.authFromContext(context);
    const plan = await planProjectBatchStatusAdjust(ctx, projectId, input);

    if (!plan.ok) {
      return { success: true, output: plan.output, skillId: this.id };
    }

    const header =
      `将 ${plan.taskIds.length} 条任务改为「${toTaskStatus(plan.toStatus)}」：\n` +
      plan.previewLines.join("\n") +
      "\n\n";

    const tail = "回复「确认」执行；「取消」放弃。";

    const confirmParams = {
      projectId: plan.projectId,
      projectName: plan.projectName,
      taskIds: plan.taskIds,
      taskNames: plan.taskNames,
      toStatus: plan.toStatus,
    };

    if (typeof context.queuePendingConfirm === "function") {
      context.queuePendingConfirm("batchUpdateProjectTaskStatus", {
        projectId: confirmParams.projectId,
        taskIds: confirmParams.taskIds,
        toStatus: confirmParams.toStatus,
      });
    }

    const fullMessage = header + tail;

    return {
      success: true,
      output: fullMessage,
      skillId: this.id,
      requiresConfirmation: true,
      confirmationData: {
        action: "batchUpdateProjectTaskStatus",
        params: confirmParams,
        message: fullMessage,
      },
    };
  }
}
