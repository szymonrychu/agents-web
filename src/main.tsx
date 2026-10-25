import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import App from './App'
import { ConfigError, loadConfig } from './config/backends'
import { theme } from './theme'
import './index.css'

const root = createRoot(document.getElementById('root')!)

loadConfig().then(
  () =>
    root.render(
      <StrictMode>
        <ThemeProvider theme={theme}>
          <CssBaseline enableColorScheme />
          <App />
        </ThemeProvider>
      </StrictMode>,
    ),
  (err: unknown) => {
    const message = err instanceof ConfigError ? err.message : `Could not load /config.json: ${String(err)}`
    const page = document.createElement('div')
    page.style.cssText = 'font-family:sans-serif;padding:2rem'
    const h = document.createElement('h1')
    h.textContent = 'Configuration error'
    const p = document.createElement('p')
    p.textContent = message
    page.append(h, p)
    document.getElementById('root')!.replaceChildren(page)
  },
)
