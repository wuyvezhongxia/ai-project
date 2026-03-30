import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.scss'
import 'antd/dist/reset.css'
import App from './App.tsx'
import { bootstrapTokenFromUrl } from './lib/http/api-client'
import { queryClient } from './lib/query/query-client'

bootstrapTokenFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#5d7cff',
            colorBgBase: '#f5f7fb',
            colorTextBase: '#1f2740',
            colorBorder: '#d9e1f2',
            borderRadius: 16,
          },
        }}
      >
        <App />
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
)
