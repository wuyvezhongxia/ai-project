import { useEffect, useMemo, useState } from 'react'
import { AppstoreOutlined, BarsOutlined, DeleteOutlined, DownOutlined, FilterOutlined, PlusOutlined, SortAscendingOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Checkbox, Dropdown, Modal, Pagination, Space, Tag } from 'antd'
import type { MenuProps } from 'antd'
import { useOutletContext } from 'react-router-dom'
import type { AppLayoutOutletContext } from '../../../components/layout/AppLayout'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'
import type { TodoScope, TodoView } from '../../workspace/types'
import { getPriorityColor, getStatusColor } from '../../workspace/utils/task-ui'
import { getAvatarLabel, getAvatarSeed, getAvatarStyle } from '../../workspace/utils/avatar'
import { useDeleteTaskMutation, useTodoKanbanQuery, useTodoListQuery, useUpdateTaskStatusMutation } from '../../workspace/services/workspace.queries'

const statusValueMap: Record<string, string> = {
  待开始: '0',
  进行中: '1',
  已完成: '2',
  延期: '3',
}

const prioritySortMap: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

const getDueTextClassName = (dueCategory?: 'today' | 'week' | 'overdue' | 'completed') => {
  if (dueCategory === 'overdue') return 'danger-text'
  if (dueCategory === 'today') return 'warning-text'
  if (dueCategory === 'completed') return 'muted-text'
  return 'success-text'
}

function TodosPage() {
  const { setHeaderToolbar } = useOutletContext<AppLayoutOutletContext>()
  const openTaskModal = useWorkspaceStore((state) => state.openTaskModal)
  const openTaskDetail = useWorkspaceStore((state) => state.openTaskDetail)
  const deleteTaskMutation = useDeleteTaskMutation()
  const updateTaskStatusMutation = useUpdateTaskStatusMutation()

  const [todoScope, setTodoScope] = useState<TodoScope>('all')
  const [todoView, setTodoView] = useState<TodoView>('list')
  const [todoStatusFilter, setTodoStatusFilter] = useState<string>('all')
  const [todoSort, setTodoSort] = useState<string>('截止时间')
  const [todoPage, setTodoPage] = useState(1)
  const [todoPageSize, setTodoPageSize] = useState(5)
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([])

  const baseParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('scope', todoScope)

    if (todoStatusFilter !== 'all') {
      params.set('status', statusValueMap[todoStatusFilter])
    }

    return params
  }, [todoScope, todoStatusFilter])

  const listParams = useMemo(() => {
    const params = new URLSearchParams(baseParams)
    params.set('view', 'list')
    return params
  }, [baseParams])

  const kanbanParams = useMemo(() => {
    const params = new URLSearchParams(baseParams)
    params.set('view', 'kanban')
    return params
  }, [baseParams])

  const { data: todoTasks = [], isLoading: loadingList } = useTodoListQuery(listParams)
  const { data: todoBoardColumns = [], isLoading: loadingBoard } = useTodoKanbanQuery(kanbanParams)
  const visibleTodoBoardColumns = useMemo(() => {
    if (todoStatusFilter === 'all') return todoBoardColumns
    return todoBoardColumns.filter((column) => column.title === todoStatusFilter)
  }, [todoBoardColumns, todoStatusFilter])
  const filteredKanbanTasks = visibleTodoBoardColumns[0]?.tasks ?? []
  const kanbanBoardClassName = todoStatusFilter === 'all' ? 'kanban-board' : 'kanban-board kanban-board-single'

  const filteredTodoTasks = useMemo(() => {
    const tasks = [...todoTasks]

    if (todoSort === '创建时间') {
      tasks.sort((a, b) => (b.createAt ?? '').localeCompare(a.createAt ?? ''))
    } else if (todoSort === '优先级') {
      tasks.sort((a, b) => prioritySortMap[a.priority] - prioritySortMap[b.priority])
    } else if (todoSort === '任务名称') {
      tasks.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      tasks.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    }

    return tasks
  }, [todoSort, todoTasks])

  const pagedTodoTasks = useMemo(() => {
    const start = (todoPage - 1) * todoPageSize
    return filteredTodoTasks.slice(start, start + todoPageSize)
  }, [filteredTodoTasks, todoPage, todoPageSize])

  useEffect(() => {
    setTodoPage(1)
  }, [todoScope, todoStatusFilter, todoSort])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredTodoTasks.length / todoPageSize))
    if (todoPage > maxPage) {
      setTodoPage(maxPage)
    }
  }, [filteredTodoTasks.length, todoPage, todoPageSize])

  useEffect(() => {
    const visibleTaskIdSet = new Set(filteredTodoTasks.map((task) => task.id))
    setSelectedTodoIds((current) => current.filter((taskId) => visibleTaskIdSet.has(taskId)))
  }, [filteredTodoTasks])

  const handleDeleteTodo = (taskId: string) => {
    Modal.confirm({
      title: '确认删除该待办？',
      content: '删除后不可恢复，请再次确认。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteTaskMutation.mutateAsync(taskId),
    })
  }

  const selectedTodoCount = selectedTodoIds.length
  const pagedTodoTaskIds = pagedTodoTasks.map((task) => task.id)
  const selectedPagedTodoCount = pagedTodoTaskIds.filter((taskId) => selectedTodoIds.includes(taskId)).length
  const allPagedTodosSelected = pagedTodoTaskIds.length > 0 && selectedPagedTodoCount === pagedTodoTaskIds.length
  const somePagedTodosSelected = selectedPagedTodoCount > 0 && selectedPagedTodoCount < pagedTodoTaskIds.length

  const toggleTodoSelection = (taskId: string, checked: boolean) => {
    setSelectedTodoIds((current) => {
      if (checked) {
        return current.includes(taskId) ? current : [...current, taskId]
      }
      return current.filter((id) => id !== taskId)
    })
  }

  const toggleSelectAllPagedTodos = (checked: boolean) => {
    setSelectedTodoIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...pagedTodoTaskIds]))
      }
      return current.filter((id) => !pagedTodoTaskIds.includes(id))
    })
  }

  const clearTodoSelection = () => setSelectedTodoIds([])

  const handleBatchStatusUpdate = (status: '1' | '2') => {
    const actionLabel = status === '2' ? '完成' : '设为进行中'
    Modal.confirm({
      title: `确认批量${actionLabel}选中的待办？`,
      content: `共 ${selectedTodoCount} 项，操作后会同步更新列表状态。`,
      okText: `批量${actionLabel}`,
      cancelText: '取消',
      onOk: async () => {
        await Promise.all(selectedTodoIds.map((taskId) => updateTaskStatusMutation.mutateAsync({ taskId, status })))
        clearTodoSelection()
      },
    })
  }

  const handleBatchDelete = () => {
    Modal.confirm({
      title: '确认批量删除选中的待办？',
      content: `共 ${selectedTodoCount} 项，删除后不可恢复，请再次确认。`,
      okText: '批量删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await Promise.all(selectedTodoIds.map((taskId) => deleteTaskMutation.mutateAsync(taskId)))
        clearTodoSelection()
      },
    })
  }

  const filterMenu = useMemo<MenuProps>(
    () => ({
      selectable: true,
      selectedKeys: [todoStatusFilter],
      items: [
        { key: 'all', label: '全部状态' },
        { key: '待开始', label: '待开始' },
        { key: '进行中', label: '进行中' },
        { key: '已完成', label: '已完成' },
        { key: '延期', label: '延期' },
      ],
      onClick: ({ key }) => setTodoStatusFilter(key),
    }),
    [todoStatusFilter],
  )

  const sortMenu = useMemo<MenuProps>(
    () => ({
      selectable: true,
      selectedKeys: [todoSort],
      items: [
        { key: '截止时间', label: '截止时间' },
        { key: '创建时间', label: '创建时间' },
        { key: '优先级', label: '优先级' },
        { key: '任务名称', label: '任务名称' },
      ],
      onClick: ({ key }) => setTodoSort(key),
    }),
    [todoSort],
  )

  const todoHeaderToolbar = useMemo(
    () => (
      <div className="toolbar-row toolbar-row-wrap todo-page-toolbar">
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
        <Space wrap className="todo-toolbar-actions">
          <Dropdown menu={filterMenu} trigger={['hover']} placement="bottomRight">
            <Button className="ghost-button" icon={<FilterOutlined />} aria-label="筛选">
              筛选
              <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown menu={sortMenu} trigger={['hover']} placement="bottomRight">
            <Button className="ghost-button" icon={<SortAscendingOutlined />} aria-label="排序">
              排序
              <DownOutlined />
            </Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={openTaskModal}>
            新建待办
          </Button>
        </Space>
      </div>
    ),
    [filterMenu, openTaskModal, sortMenu, todoScope],
  )

  useEffect(() => {
    setHeaderToolbar(todoHeaderToolbar)
  }, [setHeaderToolbar, todoHeaderToolbar])

  useEffect(() => {
    return () => {
      setHeaderToolbar(null)
    }
  }, [setHeaderToolbar])

  return (
    <section className="page-stack">
      {todoView === 'list' ? (
        <Card
          className="glass-card todo-list-surface"
          title={`待办列表 · 共 ${filteredTodoTasks.length} 项`}
          extra={
            <div className="todo-view-switch" role="tablist" aria-label="待办视图切换">
              {[
                { label: '列表', value: 'list', icon: <BarsOutlined /> },
                { label: '看板', value: 'kanban', icon: <AppstoreOutlined /> },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={todoView === item.value}
                  className={todoView === item.value ? 'todo-view-switch-button todo-view-switch-button-active' : 'todo-view-switch-button'}
                  onClick={() => setTodoView(item.value as TodoView)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="todo-list-card">
            {loadingList ? <div className="muted-text">正在加载待办...</div> : null}
            {selectedTodoCount > 0 ? (
              <div className="todo-batch-toolbar">
                <Space wrap size={12}>
                  <span className="todo-batch-summary">已选 {selectedTodoCount} 项</span>
                  <Button onClick={() => handleBatchStatusUpdate('2')}>批量完成</Button>
                  <Button onClick={() => handleBatchStatusUpdate('1')}>设为进行中</Button>
                  <Button danger onClick={handleBatchDelete}>
                    批量删除
                  </Button>
                  <Button type="link" onClick={clearTodoSelection}>
                    取消选择
                  </Button>
                </Space>
              </div>
            ) : null}
            <div className="todo-list-header">
              <Checkbox
                checked={allPagedTodosSelected}
                indeterminate={somePagedTodosSelected}
                aria-label="全选当前页待办"
                onChange={(event) => toggleSelectAllPagedTodos(event.target.checked)}
              />
              <span>任务名称</span>
              <span>所属项目</span>
              <span>状态</span>
              <span>优先级</span>
              <span>截止时间</span>
              <span>负责人</span>
              <span>操作</span>
            </div>
            {pagedTodoTasks.map((task) => (
              <div
                key={task.id}
                className="todo-list-row todo-list-row-clickable"
                role="button"
                tabIndex={0}
                onClick={() => openTaskDetail(task.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openTaskDetail(task.id)
                  }
                }}
              >
                <Checkbox
                  checked={selectedTodoIds.includes(task.id)}
                  aria-label={`选择待办 ${task.title}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => toggleTodoSelection(task.id, event.target.checked)}
                />
                <div className="todo-cell-main">
                  <div className="todo-row-title">{task.title}</div>
                  <div className="task-meta">
                    {task.favorite ? <Tag color="gold">已收藏</Tag> : null}
                    <span>{task.id}</span>
                  </div>
                </div>
                <span>{task.project}</span>
                <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                <span className={getDueTextClassName(task.dueCategory)}>{task.dueText}</span>
                <Space>
                  <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                    {getAvatarLabel(task.owner)}
                  </Avatar>
                  <span>{task.owner}</span>
                </Space>
                <div className="todo-actions">
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDeleteTodo(task.id)
                    }}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
            <div className="todo-pagination">
              <Pagination
                current={todoPage}
                pageSize={todoPageSize}
                total={filteredTodoTasks.length}
                locale={{ items_per_page: '条/页' }}
                pageSizeOptions={['5', '10', '20', '50']}
                showSizeChanger
                showLessItems
                onChange={(page, pageSize) => {
                  setTodoPage(page)
                  setTodoPageSize(pageSize)
                }}
                showTotal={(total) => `共 ${total} 条`}
              />
            </div>
          </div>
        </Card>
      ) : (
        <Card
          className="glass-card todo-kanban-surface"
          title={todoStatusFilter === 'all' ? '待办看板' : `待办看板 · ${todoStatusFilter}`}
          extra={
            <div className="todo-view-switch" role="tablist" aria-label="待办视图切换">
              {[
                { label: '列表', value: 'list', icon: <BarsOutlined /> },
                { label: '看板', value: 'kanban', icon: <AppstoreOutlined /> },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={todoView === item.value}
                  className={todoView === item.value ? 'todo-view-switch-button todo-view-switch-button-active' : 'todo-view-switch-button'}
                  onClick={() => setTodoView(item.value as TodoView)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          }
        >
          {todoStatusFilter === 'all' ? (
            <div className={kanbanBoardClassName}>
              {loadingBoard ? <div className="muted-text">正在加载看板...</div> : null}
              {visibleTodoBoardColumns.map((column) => (
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
                            <span className={getDueTextClassName(task.dueCategory)}>{task.dueText}</span>
                            <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                              {getAvatarLabel(task.owner)}
                            </Avatar>
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
          ) : (
            <div className="kanban-board-single-list">
              {loadingBoard ? <div className="muted-text">正在加载看板...</div> : null}
              {filteredKanbanTasks.length ? (
                filteredKanbanTasks.map((task) => (
                  <button key={task.id} className="board-task-card" type="button" onClick={() => openTaskDetail(task.id)}>
                    <div className="board-task-title">{task.title}</div>
                    <Space wrap className="task-meta">
                      <Tag color={getPriorityColor(task.priority)}>{task.priority}</Tag>
                      <Tag color={getStatusColor(task.status)}>{task.status}</Tag>
                    </Space>
                    <div className="board-task-footer">
                      <span className={getDueTextClassName(task.dueCategory)}>{task.dueText}</span>
                      <Avatar size="small" style={getAvatarStyle(getAvatarSeed(task.ownerId, task.owner))}>
                        {getAvatarLabel(task.owner)}
                      </Avatar>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-board-hint">当前筛选暂无任务</div>
              )}
            </div>
          )}
        </Card>
      )}
    </section>
  )
}

export default TodosPage
