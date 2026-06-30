import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp } from 'antd'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ThemeProvider, useTheme, CONTENT_MAX_WIDTH } from './theme.tsx'
import SettingsMenu from './SettingsMenu.tsx'

function Layout() {
  const { fullWidth } = useTheme()
  return (
    <div
      style={{
        maxWidth: fullWidth ? '100%' : CONTENT_MAX_WIDTH,
        marginInline: 'auto',
      }}
    >
      <App />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AntdApp>
        <BrowserRouter>
          <SettingsMenu />
          <Layout />
        </BrowserRouter>
      </AntdApp>
    </ThemeProvider>
  </StrictMode>,
)
