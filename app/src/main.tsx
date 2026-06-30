import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp } from 'antd'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ThemeProvider } from './theme.tsx'
import SettingsMenu from './SettingsMenu.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AntdApp>
        <BrowserRouter>
          <SettingsMenu />
          <App />
        </BrowserRouter>
      </AntdApp>
    </ThemeProvider>
  </StrictMode>,
)
