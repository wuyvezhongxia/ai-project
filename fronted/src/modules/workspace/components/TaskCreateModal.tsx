import { CheckCircleFilled, PlusOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form, Input, Modal, Select, Space, message } from 'antd'
import dayjs from 'dayjs'
import { useWorkspaceStore } from '../store/workspace-store'
import {
  useCreateTaskMutation,
  useProjectOptionsQuery,
  useUserOptionsQuery,
} from '../services/workspace.queries'

function TaskCreateModal() {
  const taskModalOpen = useWorkspaceStore((state) => state.taskModalOpen)
  const closeTaskModal = useWorkspaceStore((state) => state.closeTaskModal)
  const [form] = Form.useForm()
  const { data: projectOptions = [] } = useProjectOptionsQuery()
  const { data: userOptions = [] } = useUserOptionsQuery()
  const createTaskMutation = useCreateTaskMutation()

  const handleSubmit = async () => {
    const values = await form.validateFields()

    await createTaskMutation.mutateAsync({
      taskName: values.taskName,
      taskDesc: values.taskDesc,
      projectId: values.projectId,
      assigneeUserId: values.assigneeUserId,
      taskType: 'task',
      priority: values.priority,
      startTime: values.startTime?.toISOString(),
      dueTime: values.dueTime?.toISOString(),
      progress: 0,
      collaboratorUserIds: [],
      tagIds: [],
      attachmentIds: [],
    })

    message.success('任务已创建')
    form.resetFields()
    closeTaskModal()
  }

  return (
    <Modal
      open={taskModalOpen}
      onCancel={() => {
        form.resetFields()
        closeTaskModal()
      }}
      footer={null}
      width={840}
      centered
      title={
        <Space size={12}>
          <PlusOutlined />
          <span>新建任务</span>
        </Space>
      }
      className="task-modal"
    >
      <Form
        form={form}
        layout="vertical"
        className="task-form"
        initialValues={{
          projectId: projectOptions[0]?.value,
          priority: '1',
          assigneeUserId: userOptions[0]?.value,
          startTime: dayjs(),
          dueTime: dayjs().add(3, 'day'),
        }}
      >
        <Form.Item label="任务标题" name="taskName" rules={[{ required: true, message: '请输入任务标题' }]}>
          <Input placeholder="输入任务标题..." size="large" />
        </Form.Item>

        <div className="task-form-grid">
          <Form.Item label="所属项目" name="projectId">
            <Select
              size="large"
              options={projectOptions}
              placeholder="选择项目"
            />
          </Form.Item>
          <Form.Item label="优先级" name="priority">
            <Select
              size="large"
              options={[
                { label: 'P0 - 紧急', value: '3' },
                { label: 'P1 - 高', value: '2' },
                { label: 'P2 - 中', value: '1' },
                { label: 'P3 - 低', value: '0' },
              ]}
            />
          </Form.Item>
          <Form.Item label="负责人" name="assigneeUserId">
            <Select
              size="large"
              options={userOptions}
              placeholder="选择负责人"
            />
          </Form.Item>
          <Form.Item label="开始时间" name="startTime">
            <DatePicker size="large" className="full-width" showTime />
          </Form.Item>
          <Form.Item label="截止时间" name="dueTime">
            <DatePicker size="large" className="full-width" showTime />
          </Form.Item>
        </div>

        <Form.Item label="任务描述" name="taskDesc">
          <Input.TextArea rows={5} placeholder="输入详细描述..." />
        </Form.Item>

        <div className="task-form-actions">
          <Button
            size="large"
            onClick={() => {
              form.resetFields()
              closeTaskModal()
            }}
          >
            取消
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleFilled />}
            loading={createTaskMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            创建任务
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default TaskCreateModal
