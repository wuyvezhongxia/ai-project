import { CheckCircleFilled, PlusOutlined } from '@ant-design/icons'
import { Button, DatePicker, Form, Input, Modal, Select, Space, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import { useCreateProjectMutation, useUserOptionsQuery } from '../../workspace/services/workspace.queries'
import { useWorkspaceStore } from '../../workspace/store/workspace-store'

function ProjectCreateModal() {
  const projectModalOpen = useWorkspaceStore((state) => state.projectModalOpen)
  const closeProjectModal = useWorkspaceStore((state) => state.closeProjectModal)
  const [form] = Form.useForm()
  const { data: userOptions = [] } = useUserOptionsQuery()
  const createProjectMutation = useCreateProjectMutation()

  useEffect(() => {
    if (!projectModalOpen) return

    form.setFieldsValue({
      ownerUserId: userOptions[0]?.value,
      memberUserIds: userOptions[0]?.value ? [userOptions[0].value] : [],
      priority: '1',
      visibility: '1',
      startTime: dayjs(),
      endTime: dayjs().add(14, 'day'),
    })
  }, [form, projectModalOpen, userOptions])

  const handleClose = () => {
    form.resetFields()
    closeProjectModal()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const memberUserIds = Array.from(new Set([values.ownerUserId, ...(values.memberUserIds ?? [])]))

    await createProjectMutation.mutateAsync({
      projectName: values.projectName,
      projectDesc: values.projectDesc,
      ownerUserId: values.ownerUserId,
      priority: values.priority,
      startTime: values.startTime?.toISOString(),
      endTime: values.endTime?.toISOString(),
      visibility: values.visibility,
      memberUserIds,
      tagIds: [],
    })

    message.success('项目已创建')
    handleClose()
  }

  return (
    <Modal
      open={projectModalOpen}
      onCancel={handleClose}
      footer={null}
      width={840}
      centered
      title={
        <Space size={12}>
          <PlusOutlined />
          <span>新建项目</span>
        </Space>
      }
      className="task-modal"
    >
      <Form form={form} layout="vertical" className="task-form">
        <Form.Item label="项目名称" name="projectName" rules={[{ required: true, message: '请输入项目名称' }]}>
          <Input placeholder="输入项目名称..." size="large" />
        </Form.Item>

        <div className="task-form-grid">
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
          <Form.Item label="项目负责人" name="ownerUserId" rules={[{ required: true, message: '请选择项目负责人' }]}>
            <Select size="large" options={userOptions} placeholder="选择负责人" />
          </Form.Item>
          <Form.Item label="参与成员" name="memberUserIds">
            <Select mode="multiple" size="large" options={userOptions} placeholder="选择项目成员" />
          </Form.Item>
          <Form.Item label="开始时间" name="startTime">
            <DatePicker size="large" className="full-width" showTime />
          </Form.Item>
          <Form.Item label="结束时间" name="endTime">
            <DatePicker size="large" className="full-width" showTime />
          </Form.Item>
          <Form.Item label="可见范围" name="visibility">
            <Select
              size="large"
              options={[
                { label: '团队可见', value: '1' },
                { label: '仅自己可见', value: '0' },
                { label: '部门可见', value: '2' },
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item label="项目描述" name="projectDesc">
          <Input.TextArea rows={5} placeholder="输入项目背景、目标或阶段说明..." />
        </Form.Item>

        <div className="task-form-actions">
          <Button size="large" onClick={handleClose}>
            取消
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleFilled />}
            loading={createProjectMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            创建项目
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default ProjectCreateModal
