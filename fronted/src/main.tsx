import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.css'
import 'antd/dist/reset.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#5d7cff',
          colorBgBase: '#0b1020',
          colorTextBase: '#f5f7ff',
          borderRadius: 16,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
