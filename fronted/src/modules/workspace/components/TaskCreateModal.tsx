import { CheckCircleFilled, PlusOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form, Input, Modal, Select, Space } from 'antd'
import dayjs from 'dayjs'
import { useWorkspaceStore } from '../store/workspace-store'

function TaskCreateModal() {
  const taskModalOpen = useWorkspaceStore((state) => state.taskModalOpen)
  const closeTaskModal = useWorkspaceStore((state) => state.closeTaskModal)

  return (
    <Modal
      open={taskModalOpen}
      onCancel={closeTaskModal}
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
      <Form layout="vertical" className="task-form">
        <Form.Item label="任务标题" required>
          <Input placeholder="输入任务标题..." size="large" />
        </Form.Item>

        <div className="task-form-grid">
          <Form.Item label="所属项目">
            <Select
              size="large"
              options={[
                { label: '官网改版', value: 'site' },
                { label: '数据平台', value: 'data' },
              ]}
              defaultValue="site"
            />
          </Form.Item>
          <Form.Item label="优先级">
            <Select
              size="large"
              options={[
                { label: 'P0 - 紧急', value: 'p0' },
                { label: 'P1 - 高', value: 'p1' },
                { label: 'P2 - 中', value: 'p2' },
              ]}
              defaultValue="p2"
            />
          </Form.Item>
          <Form.Item label="负责人">
            <Select
              size="large"
              options={[
                { label: '张小明', value: 'zhang' },
                { label: '王芳', value: 'wang' },
              ]}
              defaultValue="zhang"
            />
          </Form.Item>
          <Form.Item label="截止时间">
            <DatePicker size="large" className="full-width" defaultValue={dayjs('2026-03-10')} />
          </Form.Item>
        </div>

        <Form.Item label="任务描述">
          <Input.TextArea rows={5} placeholder="输入详细描述..." />
        </Form.Item>

        <div className="task-form-actions">
          <Button size="large" onClick={closeTaskModal}>
            取消
          </Button>
          <Button type="primary" size="large" icon={<CheckCircleFilled />}>
            创建任务
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default TaskCreateModal
