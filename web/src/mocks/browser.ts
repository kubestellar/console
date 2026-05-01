import { setupWorker } from 'msw/browser'
import { handlers, scenarios, createHandlers } from './handlers'

/** Service worker URL — kept here (in the dynamically-imported MSW chunk)
 *  so the literal string never appears in the main index bundle. */
const MSW_SERVICE_WORKER_URL = '/mockServiceWorker.js'

// Create MSW worker
export const worker = setupWorker(...handlers)

/** Start the MSW service worker with safe defaults.
 *  Called from main.tsx via dynamic import so MSW code stays code-split. */
export async function startMocking(): Promise<void> {
  await worker.start({
    onUnhandledRequest(request, print) {
      const url = new URL(request.url)
      const path = url.pathname

      // Silently ignore unhandled /api/* requests — they fall through to
      // Netlify's SPA catch-all which returns HTML, causing JSON parse errors.
      if (path.startsWith('/api/')) {
        return
      }

      // Silently ignore static assets and known resource types.
      // These are code-split chunks, fonts, images, etc. that don't need mocking.
      if (
        path.startsWith('/assets/') ||
        path.endsWith('.js') ||
        path.endsWith('.css') ||
        path.endsWith('.wasm') ||
        path.endsWith('.woff2') ||
        path.endsWith('.woff') ||
        path.endsWith('.ttf') ||
        path.endsWith('.svg') ||
        path.endsWith('.png') ||
        path.endsWith('.jpg') ||
        path.endsWith('.ico')
      ) {
        return
      }

      // Silently ignore known application paths that don't need mocking
      if (path === '/health' || path === '/mockServiceWorker.js') {
        return
      }

      // Silently ignore cross-origin requests (fonts, avatars, analytics, etc.)
      if (url.origin !== window.location.origin) {
        return
      }

      // Only warn about truly unexpected requests
      print.warning()
    },
    serviceWorker: {
      url: MSW_SERVICE_WORKER_URL,
    },
  })
}

// Extend window type for MSW
declare global {
  interface Window {
    __msw?: {
      worker: typeof worker
      applyScenario: (name: keyof typeof scenarios) => void
      resetHandlers: () => void
    }
  }
}

// Apply a scenario by name — resets previous scenario handlers first
// to prevent stale overrides from shadowing new expectations (#7420).
export function applyScenario(name: keyof typeof scenarios) {
  const scenarioHandlers = scenarios[name]
  if (scenarioHandlers) {
    worker.resetHandlers()
    worker.use(...scenarioHandlers)
  }
}

// Reset to default handlers with fresh state
// This prevents test contamination by creating new handler instances
// with fresh mutable state (currentUser, savedCards, sharedDashboards).
// Fixes #11020: Shared mutable state in MSW handlers causing test failures
export function resetHandlers() {
  worker.resetHandlers(...createHandlers())
}

// Expose MSW controls on window for Playwright tests
if (typeof window !== 'undefined') {
  window.__msw = {
    worker,
    applyScenario,
    resetHandlers,
  }
}
