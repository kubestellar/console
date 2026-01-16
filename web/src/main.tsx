import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// Enable MSW mock service worker in demo mode (Netlify previews)
const enableMocking = async () => {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') {
    return
  }

  const { worker } = await import('./mocks/browser')

  // Start the worker with onUnhandledRequest set to bypass
  // to allow external resources (fonts, images) to load normally
  return worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  })
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
