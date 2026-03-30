import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './index.scss'
import 'antd/dist/reset.css'
import App from './App.tsx'
import { bootstrapTokenFromUrl } from './lib/http/api-client'
import { ThemeProvider, useThemeMode } from './lib/theme/theme-provider'
import { queryClient } from './lib/query/query-client'

bootstrapTokenFromUrl()

function ThemedApp() {
  const { isDarkTheme } = useThemeMode()

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#5d7cff',
          colorBgBase: isDarkTheme ? '#0b1020' : '#eef3ff',
          colorTextBase: isDarkTheme ? '#f5f7ff' : '#1f2740',
          borderRadius: 16,
        },
      }}
    >
      <App />
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ThemedApp />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
