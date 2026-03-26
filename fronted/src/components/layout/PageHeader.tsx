import { BellOutlined, FolderOpenOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Space } from 'antd'

type PageHeaderProps = {
  title: string
  subtitle: string
  actionLabel: string
  onActionClick: () => void
}

function PageHeader({ title, subtitle, actionLabel, onActionClick }: PageHeaderProps) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-main">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <Space size={12} wrap className="dashboard-header-actions">
        <Input
          className="dashboard-search"
          placeholder="搜索任务、项目、文档..."
          prefix={<FolderOpenOutlined />}
        />
        <Button className="ghost-button" shape="circle" icon={<BellOutlined />} />
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onActionClick}>
          {actionLabel}
        </Button>
      </Space>
    </header>
  )
}

export default PageHeader
