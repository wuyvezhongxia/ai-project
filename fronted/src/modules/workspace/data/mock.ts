import type {
  BoardColumn,
  GanttRow,
  PageKey,
  ProjectCard,
  RiskTask,
  Subtask,
  WorkTask,
} from '../types'

export const pageMeta: Record<PageKey, { title: string; subtitle: string; actionLabel: string }> = {
  dashboard: {
    title: '个人工作台',
    subtitle: '2026 年 3 月 4 日 星期三 · 今天是你的第 47 个工作日',
    actionLabel: '新建任务',
  },
  projects: {
    title: '项目管理',
    subtitle: '4 个活跃项目组 · 74 个进行中任务',
    actionLabel: '新建任务',
  },
  todos: {
    title: '待办中心',
    subtitle: '我的 12 个待办 · 3 个超期项',
    actionLabel: '新建待办',
  },
}

/** 侧栏：仅工作台分组；徽标数字由 useSidebarNavCounts 从列表接口统计，不在此写死 */
export const navGroups: Array<{
  title: string
  items: Array<{ key: PageKey; label: string }>
}> = [
  {
    title: '工作台',
    items: [
      { key: 'dashboard', label: '首页工作台' },
      { key: 'projects', label: '项目管理' },
      { key: 'todos', label: '待办中心' },
    ],
  },
]

export const statCards = [
  { title: '今日任务', value: '8', suffix: '已完成 5 / 8 · 62%', accent: '#6f7cff' },
  { title: '任务完成率', value: '84%', suffix: '较上周 +12%', accent: '#21d8aa' },
  { title: '延期任务', value: '3', suffix: '需重点跟进处理', accent: '#ff6a7a' },
  { title: '当前负载峰值', value: '78%', suffix: '需留意，张明排期较满', accent: '#9b7bff' },
] as const

export const mustDoTasks: WorkTask[] = [
  {
    id: 'TASK-047',
    title: '完成产品需求评审文档（V2.3）',
    project: '官网改版',
    priority: 'P0',
    status: '进行中',
    dueText: '今天 17:00',
    owner: '张小明',
    scope: 'owned',
    dueCategory: 'today',
  },
  {
    id: 'TASK-052',
    title: '修复用户登录页面闪屏 BUG',
    project: 'App 3.0 迭代',
    priority: 'P0',
    status: '进行中',
    dueText: '今天 18:00',
    owner: '王芳',
    scope: 'collaborated',
    dueCategory: 'today',
  },
  {
    id: 'TASK-061',
    title: '确认第三方数据接口对接方案',
    project: '数据分析平台',
    priority: 'P1',
    status: '待开始',
    dueText: '今天 20:00',
    owner: '赵丽',
    scope: 'created',
    dueCategory: 'today',
  },
  {
    id: 'TASK-013',
    title: '整理本周产品迭代 Changelog',
    project: '内容中台',
    priority: 'P3',
    status: '已完成',
    dueText: '已完成',
    owner: '张小明',
    completed: true,
    scope: 'owned',
    dueCategory: 'week',
  },
]

export const riskTasks: RiskTask[] = [
  {
    id: 'RISK-001',
    title: 'H5 首页全新改版设计稿交付',
    project: '官网改版',
    priority: 'P1',
    risk: '进度滞后',
    dueText: '3 月 2 日',
  },
  {
    id: 'RISK-002',
    title: '合同系统权限模块后端开发',
    project: '合同管理',
    priority: 'P1',
    risk: '延期 1 天',
    dueText: '3 月 3 日',
  },
  {
    id: 'RISK-003',
    title: '季度 OKR 完成情况自查报告',
    project: '管理看板',
    priority: 'P2',
    risk: '风险预警',
    dueText: '3 月 5 日',
  },
]

export const aiMessages = [
  {
    id: 'm1',
    role: 'assistant',
    content: '你好！我是你的智能工作助手，可以帮你创建任务、查询进度、生成周报，随时问我吧。',
  },
  { id: 'm2', role: 'user', content: '我本周还有多少任务没完成？' },
  {
    id: 'm3',
    role: 'assistant',
    content:
      '本周你共有 14 个任务，已完成 11 个，还剩 3 个未完成，其中 2 个有延期风险，建议优先处理评审文档和首页交付。',
  },
  { id: 'm4', role: 'user', content: '帮我把评审文档拆一下子任务。' },
] as const

export const memberLoads = [
  { name: '张小明', value: 78, color: '#f6c54f' },
  { name: '王芳', value: 62, color: '#ff7c8b' },
  { name: '赵丽', value: 45, color: '#1ed6a6' },
] as const

export const detailSubtasks: Subtask[] = [
  { id: 'S-1', title: '梳理用户核心使用场景（5 个）', done: true, owner: '张小明' },
  { id: 'S-2', title: '输出功能边界定义文档', done: true, owner: '张小明' },
  {
    id: 'S-3',
    title: '完成交互流程图并提交评审',
    done: false,
    owner: '张小明',
    status: '进行中',
  },
]

export const projectCards: ProjectCard[] = [
  {
    id: 'project-site',
    name: '官网全面改版',
    owner: '张小明',
    ownerId: 'user-zhangxiaoming',
    ownerAvatarLabel: '明',
    dueAt: '2026.03.20',
    progress: 68,
    status: '进行中',
    taskCount: 43,
    doneCount: 18,
    riskCount: 2,
    delayCount: 3,
    extraMemberCount: 2,
  },
  {
    id: 'project-app',
    name: 'App 3.0 迭代',
    owner: '王芳',
    ownerId: 'user-wangfang',
    ownerAvatarLabel: '芳',
    dueAt: '2026.04.01',
    progress: 42,
    status: '进行中',
    taskCount: 38,
    doneCount: 15,
    riskCount: 1,
    delayCount: 1,
    extraMemberCount: 1,
  },
  {
    id: 'project-data',
    name: '数据分析平台',
    owner: '赵丽',
    ownerId: 'user-zhaoli',
    ownerAvatarLabel: '丽',
    dueAt: '2026.05.15',
    progress: 15,
    status: '未开始',
    taskCount: 12,
    doneCount: 1,
    riskCount: 0,
    delayCount: 0,
    extraMemberCount: 0,
  },
]

export const projectBoardMap: Record<string, BoardColumn[]> = {
  'project-site': [
    {
      key: 'todo',
      title: '待开始',
      dotColor: '#8a92ff',
      count: 6,
      tasks: [
        { id: 'TASK-101', title: '用户中心改版设计', project: '官网全面改版', priority: 'P2', status: '待开始', dueText: '本周', owner: '赵丽', assignee: '赵' },
        { id: 'TASK-102', title: 'SEO 优化方案制定', project: '官网全面改版', priority: 'P2', status: '待开始', dueText: '本周', owner: '刘晨', assignee: '刘' },
        { id: 'TASK-103', title: '多语言国际化支持', project: '官网全面改版', priority: 'P3', status: '待开始', dueText: '下周', owner: '王芳', assignee: '王' },
      ],
    },
    {
      key: 'doing',
      title: '进行中',
      dotColor: '#5b79ff',
      count: 4,
      tasks: [
        { id: 'TASK-104', title: '首页主视觉 Banner 设计', project: '官网全面改版', priority: 'P0', status: '进行中', dueText: '今天', owner: '张小明', assignee: '张' },
        { id: 'TASK-105', title: '产品功能介绍页重构', project: '官网全面改版', priority: 'P1', status: '进行中', dueText: '周五', owner: '王芳', assignee: '王' },
        { id: 'TASK-106', title: 'H5 设计稿交付（已延期）', project: '官网全面改版', priority: 'P1', status: '延期', dueText: '已超期', owner: '赵丽', assignee: '赵' },
        { id: 'TASK-107', title: '导航栏样式交互优化', project: '官网全面改版', priority: 'P2', status: '进行中', dueText: '今天', owner: '刘晨', assignee: '刘' },
        { id: 'TASK-108', title: '色彩规范文档输出', project: '官网全面改版', priority: 'P2', status: '进行中', dueText: '明天', owner: '张小明', assignee: '张' },
      ],
    },
    {
      key: 'done',
      title: '已完成',
      dotColor: '#22d7a8',
      count: 13,
      tasks: [
        { id: 'TASK-109', title: '品牌视觉样稿', project: '官网全面改版', priority: 'P2', status: '已完成', dueText: '完成', owner: '张小明', assignee: '张' },
        { id: 'TASK-110', title: '竞品分析评审', project: '官网全面改版', priority: 'P1', status: '已完成', dueText: '完成', owner: '王芳', assignee: '王' },
      ],
    },
  ],
  'project-app': [
    {
      key: 'todo',
      title: '待开始',
      dotColor: '#8a92ff',
      count: 4,
      tasks: [{ id: 'TASK-201', title: '消息中心信息架构梳理', project: 'App 3.0 迭代', priority: 'P2', status: '待开始', dueText: '本周', owner: '王芳', assignee: '王' }],
    },
    {
      key: 'doing',
      title: '进行中',
      dotColor: '#5b79ff',
      count: 5,
      tasks: [
        { id: 'TASK-202', title: '支付链路异常提示优化', project: 'App 3.0 迭代', priority: 'P0', status: '进行中', dueText: '今天', owner: '王芳', assignee: '王' },
        { id: 'TASK-203', title: '埋点方案验收', project: 'App 3.0 迭代', priority: 'P1', status: '待开始', dueText: '明天', owner: '刘晨', assignee: '刘' },
      ],
    },
    {
      key: 'done',
      title: '已完成',
      dotColor: '#22d7a8',
      count: 11,
      tasks: [{ id: 'TASK-204', title: '深色模式视觉统一', project: 'App 3.0 迭代', priority: 'P2', status: '已完成', dueText: '完成', owner: '赵丽', assignee: '赵' }],
    },
  ],
  'project-data': [
    {
      key: 'todo',
      title: '待开始',
      dotColor: '#8a92ff',
      count: 7,
      tasks: [{ id: 'TASK-301', title: '数据指标口径梳理', project: '数据分析平台', priority: 'P1', status: '待开始', dueText: '本周', owner: '赵丽', assignee: '赵' }],
    },
    { key: 'doing', title: '进行中', dotColor: '#5b79ff', count: 1, tasks: [] },
    { key: 'done', title: '已完成', dotColor: '#22d7a8', count: 1, tasks: [] },
  ],
}

export const ganttRowsMap: Record<string, GanttRow[]> = {
  'project-site': [
    { label: '首页设计', start: 12, width: 50, color: '#5a7cff', note: '首页主视觉设计' },
    { label: '功能开发', start: 40, width: 42, color: '#7f63ff', note: '产品功能页' },
    { label: 'H5 适配', start: 8, width: 22, color: '#ff7a87', note: '延期中' },
  ],
  'project-app': [
    { label: '支付链路', start: 16, width: 32, color: '#5a7cff', note: '异常处理' },
    { label: '消息中心', start: 42, width: 30, color: '#21d8aa', note: '进行中' },
    { label: '埋点验收', start: 76, width: 14, color: '#5a7cff', note: '待开始' },
  ],
  'project-data': [
    { label: '数据模型', start: 18, width: 24, color: '#5a7cff', note: '待开始' },
    { label: '图表设计', start: 48, width: 18, color: '#7f63ff', note: '待排期' },
    { label: '权限方案', start: 68, width: 20, color: '#21d8aa', note: '需求中' },
  ],
}

export const initialTodoTasks: WorkTask[] = [
  { id: 'TODO-001', title: '完成产品需求评审文档（V2.3）', project: '官网全面改版', priority: 'P0', status: '进行中', dueText: '今天 17:00', owner: '张小明', scope: 'owned', dueCategory: 'today', favorite: true },
  { id: 'TODO-002', title: '修复用户登录页面闪屏 BUG', project: 'App 3.0 迭代', priority: 'P0', status: '进行中', dueText: '今天 18:00', owner: '王芳', scope: 'collaborated', dueCategory: 'today' },
  { id: 'TODO-003', title: '确认第三方数据接口对接方案', project: '数据分析平台', priority: 'P1', status: '待开始', dueText: '今天 20:00', owner: '赵丽', scope: 'created', dueCategory: 'today' },
  { id: 'TODO-004', title: '整理版本发布 Checklist', project: '官网全面改版', priority: 'P2', status: '待开始', dueText: '本周四', owner: '张小明', scope: 'owned', dueCategory: 'week' },
  { id: 'TODO-005', title: '输出周报给管理层', project: '管理看板', priority: 'P1', status: '延期', dueText: '已超期 1 天', owner: '张小明', scope: 'created', dueCategory: 'overdue', favorite: true },
  { id: 'TODO-006', title: '完善用户反馈埋点列表', project: 'App 3.0 迭代', priority: 'P2', status: '已完成', dueText: '已完成', owner: '刘晨', scope: 'collaborated', dueCategory: 'week' },
]
