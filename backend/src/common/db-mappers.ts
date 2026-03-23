import type {
  AiRecord as DbAiRecord,
  Attachment as DbAttachment,
  Dept as DbDept,
  Project as DbProject,
  ProjectMember as DbProjectMember,
  ProjectTagRel as DbProjectTagRel,
  Subtask as DbSubtask,
  Tag as DbTag,
  Task as DbTask,
  TaskActivity as DbTaskActivity,
  TaskAttachmentRel as DbTaskAttachmentRel,
  TaskCollaborator as DbTaskCollaborator,
  TaskComment as DbTaskComment,
  TaskRelation as DbTaskRelation,
  TaskTagRel as DbTaskTagRel,
  Tenant as DbTenant,
  User as DbUser,
} from "@prisma/client";

import type {
  AiRecord,
  Attachment,
  DeptProfile,
  Project,
  ProjectMember,
  ProjectTagRel,
  Subtask,
  Tag,
  Task,
  TaskActivity,
  TaskAttachmentRel,
  TaskCollaborator,
  TaskComment,
  TaskRelation,
  TaskTagRel,
  TenantProfile,
  UserProfile,
} from "./types";
import { fromDbDecimal, fromDbId } from "./db-values";

const iso = (d: Date | null | undefined) => d?.toISOString();

export function toTenantProfile(t: DbTenant): TenantProfile {
  return {
    tenantId: t.tenantId,
    companyName: t.companyName ?? "",
    status: (t.status ?? "1") as TenantProfile["status"],
    expireTime: iso(t.expireTime) ?? "",
    llmId: fromDbId(t.llmId),
  };
}

export function toDeptProfile(d: DbDept): DeptProfile {
  return {
    deptId: fromDbId(d.deptId)!,
    tenantId: d.tenantId ?? "",
    parentId: fromDbId(d.parentId) ?? null,
    deptName: d.deptName ?? "",
    leader: fromDbId(d.leader),
  };
}

export function toUserProfile(u: DbUser): UserProfile {
  return {
    userId: fromDbId(u.userId)!,
    tenantId: u.tenantId ?? "",
    deptId: fromDbId(u.deptId)!,
    userName: u.userName,
    nickName: u.nickName,
    status: (u.status ?? "1") as UserProfile["status"],
    delFlag: (u.delFlag ?? "1") as UserProfile["delFlag"],
  };
}

export function toProject(p: DbProject): Project {
  return {
    id: fromDbId(p.id)!,
    tenantId: p.tenantId,
    projectCode: p.projectCode ?? undefined,
    projectName: p.projectName,
    projectDesc: p.projectDesc ?? undefined,
    ownerUserId: fromDbId(p.ownerUserId)!,
    ownerDeptId: fromDbId(p.ownerDeptId),
    status: p.status as Project["status"],
    priority: (p.priority ?? undefined) as Project["priority"],
    startTime: iso(p.startTime),
    endTime: iso(p.endTime),
    progress: fromDbDecimal(p.progress) ?? 0,
    visibility: (p.visibility ?? undefined) as Project["visibility"],
    createDept: fromDbId(p.createDept),
    createBy: fromDbId(p.createBy)!,
    createTime: p.createTime.toISOString(),
    updateBy: fromDbId(p.updateBy),
    updateTime: iso(p.updateTime),
    delFlag: p.delFlag as Project["delFlag"],
  };
}

export function toProjectMember(m: DbProjectMember): ProjectMember {
  return {
    id: fromDbId(m.id)!,
    tenantId: m.tenantId,
    projectId: fromDbId(m.projectId)!,
    userId: fromDbId(m.userId)!,
    deptId: fromDbId(m.deptId),
    roleType: m.roleType as ProjectMember["roleType"],
    joinType: (m.joinType ?? undefined) as ProjectMember["joinType"],
    createBy: fromDbId(m.createBy)!,
    createTime: m.createTime.toISOString(),
    delFlag: m.delFlag as ProjectMember["delFlag"],
  };
}

export function toTask(t: DbTask): Task {
  return {
    id: fromDbId(t.id)!,
    tenantId: t.tenantId,
    projectId: fromDbId(t.projectId),
    taskNo: t.taskNo ?? undefined,
    taskName: t.taskName,
    taskDesc: t.taskDesc ?? undefined,
    assigneeUserId: fromDbId(t.assigneeUserId),
    assigneeDeptId: fromDbId(t.assigneeDeptId),
    creatorUserId: fromDbId(t.creatorUserId)!,
    status: t.status as Task["status"],
    priority: (t.priority ?? undefined) as Task["priority"],
    progress: fromDbDecimal(t.progress) ?? 0,
    startTime: iso(t.startTime),
    dueTime: iso(t.dueTime),
    finishTime: iso(t.finishTime),
    riskLevel: (t.riskLevel ?? undefined) as Task["riskLevel"],
    parentTaskId: fromDbId(t.parentTaskId),
    createDept: fromDbId(t.createDept),
    createBy: fromDbId(t.createBy)!,
    createTime: t.createTime.toISOString(),
    updateBy: fromDbId(t.updateBy),
    updateTime: iso(t.updateTime),
    delFlag: t.delFlag as Task["delFlag"],
  };
}

export function toTaskCollaborator(c: DbTaskCollaborator): TaskCollaborator {
  return {
    id: fromDbId(c.id)!,
    tenantId: c.tenantId,
    taskId: fromDbId(c.taskId)!,
    userId: fromDbId(c.userId)!,
    deptId: fromDbId(c.deptId),
    createBy: fromDbId(c.createBy)!,
    createTime: c.createTime.toISOString(),
    delFlag: c.delFlag as TaskCollaborator["delFlag"],
  };
}

export function toSubtask(s: DbSubtask): Subtask {
  return {
    id: fromDbId(s.id)!,
    tenantId: s.tenantId,
    taskId: fromDbId(s.taskId)!,
    subtaskName: s.subtaskName,
    status: s.status as Subtask["status"],
    sortNo: s.sortNo ?? undefined,
    createBy: fromDbId(s.createBy)!,
    createTime: s.createTime.toISOString(),
    updateBy: fromDbId(s.updateBy),
    updateTime: iso(s.updateTime),
    delFlag: s.delFlag as Subtask["delFlag"],
  };
}

export function toTaskComment(c: DbTaskComment): TaskComment {
  return {
    id: fromDbId(c.id)!,
    tenantId: c.tenantId,
    taskId: fromDbId(c.taskId)!,
    commentUserId: fromDbId(c.commentUserId)!,
    content: c.content,
    parentCommentId: fromDbId(c.parentCommentId),
    createTime: c.createTime.toISOString(),
    delFlag: c.delFlag as TaskComment["delFlag"],
  };
}

export function toAttachment(a: DbAttachment): Attachment {
  return {
    id: fromDbId(a.id)!,
    tenantId: a.tenantId,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    fileSize: fromDbDecimal(a.fileSize),
    fileType: a.fileType ?? undefined,
    storageType: a.storageType ?? undefined,
    uploadUserId: fromDbId(a.uploadUserId)!,
    createTime: a.createTime.toISOString(),
    delFlag: a.delFlag as Attachment["delFlag"],
  };
}

export function toTaskAttachmentRel(r: DbTaskAttachmentRel): TaskAttachmentRel {
  return {
    id: fromDbId(r.id)!,
    tenantId: r.tenantId,
    taskId: fromDbId(r.taskId)!,
    attachmentId: fromDbId(r.attachmentId)!,
    createBy: fromDbId(r.createBy)!,
    createTime: r.createTime.toISOString(),
  };
}

export function toTag(tag: DbTag): Tag {
  return {
    id: fromDbId(tag.id)!,
    tenantId: tag.tenantId,
    tagName: tag.tagName,
    tagColor: tag.tagColor ?? undefined,
    tagType: (tag.tagType ?? undefined) as Tag["tagType"],
    createBy: fromDbId(tag.createBy)!,
    createTime: tag.createTime.toISOString(),
    delFlag: tag.delFlag as Tag["delFlag"],
  };
}

export function toTaskTagRel(r: DbTaskTagRel): TaskTagRel {
  return {
    id: fromDbId(r.id)!,
    tenantId: r.tenantId,
    taskId: fromDbId(r.taskId)!,
    tagId: fromDbId(r.tagId)!,
    createBy: fromDbId(r.createBy)!,
    createTime: r.createTime.toISOString(),
  };
}

export function toProjectTagRel(r: DbProjectTagRel): ProjectTagRel {
  return {
    id: fromDbId(r.id)!,
    tenantId: r.tenantId,
    projectId: fromDbId(r.projectId)!,
    tagId: fromDbId(r.tagId)!,
    createBy: fromDbId(r.createBy)!,
    createTime: r.createTime.toISOString(),
  };
}

export function toTaskRelation(r: DbTaskRelation): TaskRelation {
  return {
    id: fromDbId(r.id)!,
    tenantId: r.tenantId,
    taskId: fromDbId(r.fromTaskId)!,
    relationType: r.relationType as TaskRelation["relationType"],
    targetId: fromDbId(r.toTaskId),
    targetTitle: "",
    createBy: fromDbId(r.createBy)!,
    createTime: r.createTime.toISOString(),
    delFlag: "0",
  };
}

export function toTaskActivity(a: DbTaskActivity): TaskActivity {
  return {
    id: fromDbId(a.id)!,
    tenantId: a.tenantId,
    taskId: fromDbId(a.taskId)!,
    actionType: a.actionType,
    actionUserId: fromDbId(a.actionUserId)!,
    actionContent: a.actionContent ?? undefined,
    extraJson: (a.extraJson as Record<string, unknown> | null | undefined) ?? undefined,
    createTime: a.createTime.toISOString(),
  };
}

export function toAiRecord(r: DbAiRecord): AiRecord {
  return {
    id: fromDbId(r.id)!,
    tenantId: r.tenantId,
    bizType: r.bizType,
    bizId: fromDbId(r.bizId),
    inputText: r.inputText,
    outputText: r.outputText ?? undefined,
    modelId: fromDbId(r.modelId),
    createBy: fromDbId(r.createBy)!,
    createTime: r.createTime.toISOString(),
  };
}
