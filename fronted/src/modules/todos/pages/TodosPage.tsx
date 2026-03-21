import { useMemo, useState } from 'react'
import { AppstoreOutlined, BarsOutlined, DeleteOutlined, FilterOutlined, PlusOutlined, SortAscendingOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Modal, Segmented, Select, Space, Tag } from 'antd'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import type { TodoScope, TodoView } from '../../workspace/types'
import { getPriorityColor, getStatusColor, toBoardTask } from '../../workspace/utils/task-ui'

function TodosPage() {
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const todoTasks = useWorkspaceStore((state) => state.todoTasks)
  const deleteTodoTask = useWorkspaceStore((state) => state.deleteTodoTask)

  const [todoScope, setTodoScope] = useState<TodoScope>('all')
  const [todoView, setTodoView] = useState<TodoView>('list')
  const [todoProjectFilter, setTodoProjectFilter] = useState<string>('all')
  const [todoStatusFilter, setTodoStatusFilter] = useState<string>('all')
  const [todoSort, setTodoSort] = useState<string>('截止时间')

  const filteredTodoTasks = useMemo(() => {
    let tasks = [...todoTasks]

    if (todoScope !== 'all') {
      tasks = tasks.filter((task) => task.scope === todoScope)
    }

    if (todoProjectFilter !== 'all') {
      tasks = tasks.filter((task) => task.project === todoProjectFilter)
    }

    if (todoStatusFilter !== 'all') {
      tasks = tasks.filter((task) => task.status === todoStatusFilter)
    }

    if (todoSort === '优先级') {
      tasks.sort((a, b) => a.priority.localeCompare(b.priority))
    } else if (todoSort === '任务名称') {
      tasks.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      tasks.sort((a, b) => a.dueText.localeCompare(b.dueText))
    }

    return tasks
  }, [todoProjectFilter, todoScope, todoSort, todoStatusFilter, todoTasks])

  const todoBoardColumns = useMemo(
    () => [
      {
        key: 'todo-board',
        title: '待开始',
        dotColor: '#8a92ff',
        tasks: filteredTodoTasks.filter((task) => task.status === '待开始').map(toBoardTask),
      },
      {
        key: 'doing-board',
        title: '进行中',
        dotColor: '#5b79ff',
        tasks: filteredTodoTasks.filter((task) => task.status === '进行中').map(toBoardTask),
      },
      {
        key: 'review-board',
        title: '待审核',
        dotColor: '#f7c44b',
        tasks: filteredTodoTasks.filter((task) => task.status === '待审核').map(toBoardTask),
      },
      {
        key: 'done-board',
        title: '已完成',
        dotColor: '#22d7a8',
        tasks: filteredTodoTasks.filter((task) => task.status === '已完成').map(toBoardTask),
      },
    ],
    [filteredTodoTasks],
  )

  const handleDeleteTodo = (taskId: string) => {
    Modal.confirm({
      title: '确认删除该待办？',
      content: '删除后不可恢复，请再次确认。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteTodoTask(taskId),
    })
  }

  return (
    <section className="page-stack">
      <Card className="glass-card">
        <div className="toolbar-row toolbar-row-wrap">
          <Space wrap>
            <Button type={todoScope === 'all' ? 'primary' : 'default'} className={todoScope === 'all' ? '' : 'ghost-button'} onClick={() => setTodoScope('all')}>
              全部
            </Button>
            <Button type={todoScope === 'owned' ? 'primary' : 'default'} className={todoScope === 'owned' ? '' : 'ghost-button'} onClick={() => setTodoScope('owned')}>
              我负责的
            </Button>
            <Button type={todoScope === 'created' ? 'primary' : 'default'} className={todoScope === 'created' ? '' : 'ghost-button'} onClick={() => setTodoScope('created')}>
              我创建的
            </Button>
            <Button
              type={todoScope === 'collaborated' ? 'primary' : 'default'}
              className={todoScope === 'collaborated' ? '' : 'ghost-button'}
              onClick={() => setTodoScope('collaborated')}
            >
              协作中
            </Button>
          </Space>
          <Space wrap>
            <Button className="ghost-button" icon={<FilterOutlined />}>
              日筛选
            </Button>
            <Button className="ghost-button" icon={<SortAscendingOutlined />}>
              排序
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openTaskModal}>
              新建待办
            </Button>
          </Space>
        </div>
      </Card>

      <Card className="glass-card">
        <div className="todo-toolbar">
          <Space wrap>
            <Select
              value={todoProjectFilter}
              onChange={setTodoProjectFilter}
              options={[
                { label: '全部项目', value: 'all' },
                ...Array.from(new Set(todoTasks.map((task) => task.project))).map((project) => ({
                  label: project,
                  value: project,
                })),
              ]}
            />
            <Select
              value={todoStatusFilter}
              onChange={setTodoStatusFilter}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '待开始', value: '待开始' },
                { label: '进行中', value: '进行中' },
                { label: '待审核', value: '待审核' },
                { label: '已完成', value: '已完成' },
                { label: '延期', value: '延期' },
              ]}
            />
            <Select
              value={todoSort}
              onChange={setTodoSort}
              options={[
                { label: '截止时间', value: '截止时间' },
                { label: '优先级', value: '优先级' },
                { label: '任务名称', value: '任务名称' },
              ]}
            />
          </Space>
          <Segmented
            value={todoView}
            onChange={(value) => setTodoView(value as TodoView)}
            options={[
              { label: '列表', value: 'list', icon: <BarsOutlined /> },
              { label: '看板', value: 'kanban', icon: <AppstoreOutlined /> },
            ]}
          />
        </div>
      </Card>

      {todoView === 'list' ? (
        <Card
          className="glass-card"
          title={`待办列表 · 共 ${filteredTodoTasks.length} 项`}
          extra={<Tag color="processing">列表视图</Tag>}
        >
          <div className="todo-list-card">
            <div className="todo-list-header">
              <span>任务名称</span>
              <span>所属项目</span>
              <span>状态</span>
              <span>优先级</span>
              <span>截止时间</span>
              <span>负责人</span>
              <span>操作</span>
            </div>
            {filteredTodoTasks.map((task) => (
              <div key={task.id} className="todo-list-row">
                <button type="button" className="todo-cell-main todo-cell-trigger" onClick={() => openTaskDetail(task.id)}>
                  <div className="todo-row-title">{task.title}</div>
                  <div className="task-meta">
                    {task.favorite ? <Tag color="gold">已收藏</Tag> : null}
                    <span>{task.id}</span>
                  </div>
                </button>
                <span>{task.project}</span>
                <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                <span className={task.status === '延期' ? 'danger-text' : ''}>{task.dueText}</span>
                <Space>
                  <Avatar size="small">{task.owner.slice(0, 1)}</Avatar>
                  <span>{task.owner}</span>
                </Space>
                <div className="todo-actions">
                  <Button type="link" onClick={() => openTaskDetail(task.id)}>
                    详情
                  </Button>
                  <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteTodo(task.id)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="glass-card" title="待办看板" extra={<Tag color="processing">看板视图</Tag>}>
          <div className="kanban-board">
            {todoBoardColumns.map((column) => (
              <div key={column.key} className="kanban-column">
                <div className="kanban-column-header">
                  <Space>
                    <span className="kanban-dot" style={{ background: column.dotColor }} />
                    <span>{column.title}</span>
                    <Tag bordered={false}>{column.tasks.length}</Tag>
                  </Space>
                </div>
                <div className="kanban-column-body">
                  {column.tasks.length ? (
                    column.tasks.map((task) => (
                      <button key={task.id} className="board-task-card" type="button" onClick={() => openTaskDetail(task.id)}>
                        <div className="board-task-title">{task.title}</div>
                        <Space wrap className="task-meta">
                          <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                          <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                        </Space>
                        <div className="board-task-footer">
                          <span>{task.dueText}</span>
                          <Avatar size="small">{task.assignee}</Avatar>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="empty-board-hint">当前列暂无任务</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  )
}

export default TodosPage
