# PM Backend

基于 `Express + TypeScript` 的项目管理后端骨架，已实现以下内容：

- 统一鉴权中间件，支持 JWT 解析与开发环境绕过
- 项目、项目成员、任务、子任务、评论、附件、标签、关系、活动记录接口
- 组织代理接口与 AI 占位接口
- 统一错误响应、参数校验、日志接入
- 当前使用内存数据仓库模拟数据，便于先联调接口；后续可替换为 PostgreSQL Repository

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

默认端口：`3000`

### 数据库

- **所有业务数据都在 `DATABASE_URL` 指向的那一个 PostgreSQL 库里。** 若默认或 `.env` 改成了另一个库名（例如从 `sub_pm` 换成空的 `ai_project_pm`），界面会像「数据没了」——数据仍在旧库里，把 `DATABASE_URL` 改回去即可。
- 执行 `prisma db push` / migrate 前请确认连接串，**勿对父项目/共用生产库执行**，以免改到对方表结构。
- 表结构与 Prisma 对齐：`pnpm exec prisma db push`（或团队的 migrate 流程）。若全库 `db push` 因历史表结构差异报错，可**仅修子任务表**（幂等）：`pnpm run db:ensure-subtask-columns`（补列 + 将 `status` 的 CHECK 放宽为 `0/1/2`，否则选「已取消」会因库内旧约束报错）。
- 可选 **`DATABASE_URL_BLOCKED_SUBSTRINGS`**（逗号分隔）：连接串包含任一字串时拒绝启动，防误连指定主机名等。

健康检查：

```bash
curl http://localhost:3000/health
```

## Auth

默认所有 `/api/**` 接口都需要鉴权。

开发环境下如果 `.env` 中设置：

```env
ALLOW_DEV_AUTH_BYPASS=true
```

则未携带 token 时会自动注入一个默认用户上下文：

```json
{
  "userId": 1001,
  "tenantId": "t_001",
  "deptId": 2001,
  "userName": "zhangsan",
  "nickName": "张三",
  "roleIds": [1]
}
```

如果你要用真实 token，本项目按如下 payload 解析：

```json
{
  "user_id": 1001,
  "tenant_id": "t_001",
  "dept_id": 2001,
  "user_name": "zhangsan",
  "nick_name": "张三",
  "role_ids": [1],
  "exp": 4102444800
}
```

## Implemented API

### Auth

- `GET /api/auth/context`
- `GET /api/auth/check`

### Org

- `GET /api/org/users/options`
- `GET /api/org/depts/tree`
- `GET /api/org/users/:id`
- `GET /api/org/tenants/current`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/options`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `PATCH /api/projects/:id/archive`
- `GET /api/projects/:id/members`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`
- `GET /api/projects/:id/tasks`
- `GET /api/projects/:id/gantt`
- `GET /api/projects/:id/statistics`

### Tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `PATCH /api/tasks/:id/status`
- `POST /api/tasks/:id/favorite`
- `DELETE /api/tasks/:id/favorite`
- `GET /api/tasks/dashboard`
- `GET /api/tasks/must-do-today`
- `GET /api/tasks/risk`
- `GET /api/tasks/todo`
- `GET /api/tasks/:id/subtasks`
- `POST /api/tasks/:id/subtasks`
- `PATCH /api/subtasks/:id`
- `DELETE /api/subtasks/:id`
- `GET /api/tasks/:id/comments`
- `POST /api/tasks/:id/comments`
- `PATCH /api/comments/:id`
- `DELETE /api/comments/:id`
- `POST /api/files/upload`
- `GET /api/tasks/:id/attachments`
- `POST /api/tasks/:id/attachments`
- `DELETE /api/tasks/:id/attachments/:attachmentId`
- `DELETE /api/attachments/:id`
- `GET /api/tags`
- `POST /api/tags`
- `POST /api/tasks/:id/tags`
- `DELETE /api/tasks/:id/tags/:tagId`
- `GET /api/tasks/:id/relations`
- `POST /api/tasks/:id/relations`
- `DELETE /api/relations/:id`
- `GET /api/tasks/:id/activities`
- `GET /api/workload/team`

### AI

- `POST /api/ai/chat`
- `POST /api/ai/weekly-report`
- `POST /api/ai/task-breakdown`
- `POST /api/ai/delay-analysis`
- `POST /api/ai/project-progress`
- `POST /api/ai/task-insight`

## Project Structure

```text
src/
  app.ts
  server.ts
  config/
  common/
  modules/
    auth/
    org/
    ai/
    project/
    task/
```

## Next Step

当前代码的 Repository 层由 `src/common/data-store.ts` 提供内存实现。  
如果你要切 PostgreSQL，建议下一步按下面顺序替换：

1. 抽出 `project.repository.ts` / `task.repository.ts`
2. 用 `pg`、`knex` 或 `prisma` 接管 CRUD
3. 保持现有 `controller -> service -> repository` 分层不变
4. 将主系统代理改为真实 HTTP 调用或镜像表查询
