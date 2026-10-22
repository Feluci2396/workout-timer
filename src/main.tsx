import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Service Worker für PWA registrieren (wird von vite-plugin-pwa automatisch generiert)
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
