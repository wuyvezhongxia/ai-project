import type { Request } from "express";

export type ID = number;

export type AuthContext = {
  userId: ID;
  tenantId: string;
  deptId?: ID;
  userName?: string;
  nickName?: string;
  roleIds: ID[];
};

export type AuthedRequest = Request & {
  ctx: AuthContext;
  token?: string;
};

export type StatusValue = "0" | "1" | "2" | "3" | "4";

export type UserProfile = {
  userId: ID;
  tenantId: string;
  deptId: ID;
  userName: string;
  nickName: string;
  status: "0" | "1";
  delFlag: "0" | "1";
};

export type DeptProfile = {
  deptId: ID;
  tenantId: string;
  parentId: ID | null;
  deptName: string;
  leader?: ID;
};

export type TenantProfile = {
  tenantId: string;
  companyName: string;
  status: "0" | "1";
  expireTime: string;
  llmId?: ID;
};

export type Project = {
  id: ID;
  tenantId: string;
  projectCode?: string;
  projectName: string;
  projectDesc?: string;
  ownerUserId: ID;
  ownerDeptId?: ID;
  status: "0" | "1" | "2" | "3";
  priority?: "0" | "1" | "2" | "3";
  startTime?: string;
  endTime?: string;
  progress: number;
  visibility?: "0" | "1" | "2";
  createDept?: ID;
  createBy: ID;
  createTime: string;
  updateBy?: ID;
  updateTime?: string;
  delFlag: "0" | "1";
};

export type ProjectMember = {
  id: ID;
  tenantId: string;
  projectId: ID;
  userId: ID;
  deptId?: ID;
  roleType: "owner" | "member" | "observer";
  joinType?: "create" | "invite" | "sync";
  createBy: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type Task = {
  id: ID;
  tenantId: string;
  projectId?: ID;
  taskNo?: string;
  taskName: string;
  taskDesc?: string;
  assigneeUserId?: ID;
  assigneeDeptId?: ID;
  creatorUserId: ID;
  sourceType?: "manual" | "ai" | "import";
  taskType?: "task" | "bug" | "todo";
  status: StatusValue;
  priority?: "0" | "1" | "2" | "3";
  progress: number;
  startTime?: string;
  dueTime?: string;
  finishTime?: string;
  estimatedHours?: number;
  actualHours?: number;
  riskLevel?: "0" | "1" | "2" | "3";
  parentTaskId?: ID;
  sortNo?: number;
  createDept?: ID;
  createBy: ID;
  createTime: string;
  updateBy?: ID;
  updateTime?: string;
  delFlag: "0" | "1";
};

export type TaskCollaborator = {
  id: ID;
  tenantId: string;
  taskId: ID;
  userId: ID;
  deptId?: ID;
  createBy: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type Subtask = {
  id: ID;
  tenantId: string;
  taskId: ID;
  subtaskName: string;
  status: "0" | "1";
  sortNo?: number;
  createBy: ID;
  createTime: string;
  updateBy?: ID;
  updateTime?: string;
  delFlag: "0" | "1";
};

export type TaskComment = {
  id: ID;
  tenantId: string;
  taskId: ID;
  commentUserId: ID;
  content: string;
  parentCommentId?: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type Attachment = {
  id: ID;
  tenantId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  fileType?: string;
  storageType?: string;
  uploadUserId: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type TaskAttachmentRel = {
  id: ID;
  tenantId: string;
  taskId: ID;
  attachmentId: ID;
  createBy: ID;
  createTime: string;
};

export type Tag = {
  id: ID;
  tenantId: string;
  tagName: string;
  tagColor?: string;
  tagType?: "project" | "task" | "common";
  createBy: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type TaskTagRel = {
  id: ID;
  tenantId: string;
  taskId: ID;
  tagId: ID;
  createBy: ID;
  createTime: string;
};

export type ProjectTagRel = {
  id: ID;
  tenantId: string;
  projectId: ID;
  tagId: ID;
  createBy: ID;
  createTime: string;
};

export type TaskRelation = {
  id: ID;
  tenantId: string;
  taskId: ID;
  relationType: "task" | "project" | "url" | "file" | "doc";
  targetId?: ID;
  targetTitle: string;
  targetUrl?: string;
  createBy: ID;
  createTime: string;
  delFlag: "0" | "1";
};

export type TaskActivity = {
  id: ID;
  tenantId: string;
  taskId: ID;
  actionType: string;
  actionUserId: ID;
  actionContent?: string;
  extraJson?: Record<string, unknown>;
  createTime: string;
};

export type TaskFavorite = {
  id: ID;
  tenantId: string;
  taskId: ID;
  userId: ID;
  createTime: string;
};

export type AiRecord = {
  id: ID;
  tenantId: string;
  bizType: string;
  bizId?: ID;
  inputText: string;
  outputText?: string;
  modelId?: ID;
  createBy: ID;
  createTime: string;
};
