import {
  AiRecord,
  Attachment,
  DeptProfile,
  ID,
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
  TaskFavorite,
  TaskRelation,
  TaskTagRel,
  TenantProfile,
  UserProfile,
} from "./types";

const now = () => new Date().toISOString();

class DataStore {
  private counters = new Map<string, number>();

  readonly users: UserProfile[] = [
    {
      userId: 1001,
      tenantId: "t_001",
      deptId: 2001,
      userName: "zhangsan",
      nickName: "张三",
      status: "0",
      delFlag: "0",
    },
    {
      userId: 1002,
      tenantId: "t_001",
      deptId: 2001,
      userName: "lisi",
      nickName: "李四",
      status: "0",
      delFlag: "0",
    },
    {
      userId: 1003,
      tenantId: "t_001",
      deptId: 2002,
      userName: "wangwu",
      nickName: "王五",
      status: "0",
      delFlag: "0",
    },
  ];

  readonly depts: DeptProfile[] = [
    { deptId: 2001, tenantId: "t_001", parentId: null, deptName: "产品部", leader: 1001 },
    { deptId: 2002, tenantId: "t_001", parentId: null, deptName: "研发部", leader: 1002 },
  ];

  readonly tenants: TenantProfile[] = [
    {
      tenantId: "t_001",
      companyName: "示例科技",
      status: "0",
      expireTime: "2099-12-31T23:59:59.000Z",
      llmId: 1,
    },
  ];

  readonly projects: Project[] = [];
  readonly projectMembers: ProjectMember[] = [];
  readonly tasks: Task[] = [];
  readonly taskCollaborators: TaskCollaborator[] = [];
  readonly subtasks: Subtask[] = [];
  readonly comments: TaskComment[] = [];
  readonly attachments: Attachment[] = [];
  readonly taskAttachmentRels: TaskAttachmentRel[] = [];
  readonly tags: Tag[] = [
    {
      id: 1,
      tenantId: "t_001",
      tagName: "高优先级",
      tagColor: "#f5222d",
      tagType: "task",
      createBy: 1001,
      createTime: now(),
      delFlag: "0",
    },
    {
      id: 2,
      tenantId: "t_001",
      tagName: "核心项目",
      tagColor: "#1677ff",
      tagType: "project",
      createBy: 1001,
      createTime: now(),
      delFlag: "0",
    },
  ];
  readonly taskTagRels: TaskTagRel[] = [];
  readonly projectTagRels: ProjectTagRel[] = [];
  readonly taskRelations: TaskRelation[] = [];
  readonly taskActivities: TaskActivity[] = [];
  readonly taskFavorites: TaskFavorite[] = [];
  readonly aiRecords: AiRecord[] = [];

  nextId(scope: string): ID {
    const current = this.counters.get(scope) ?? 1;
    this.counters.set(scope, current + 1);
    return current;
  }
}

export const db = new DataStore();
