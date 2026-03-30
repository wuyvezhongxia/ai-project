import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle: string
  toolbar?: ReactNode
}

function PageHeader({ title, subtitle, toolbar }: PageHeaderProps) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-main">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {toolbar ? <div className="dashboard-header-toolbar">{toolbar}</div> : null}
    </header>
  )
}

export default PageHeader
