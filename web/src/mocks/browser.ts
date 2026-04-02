import { setupWorker } from 'msw/browser'
import { handlers, scenarios } from './handlers'

/** Service worker URL — kept here (in the dynamically-imported MSW chunk)
 *  so the literal string never appears in the main index bundle. */
const MSW_SERVICE_WORKER_URL = '/mockServiceWorker.js'

// Create MSW worker
export const worker = setupWorker(...handlers)

/** Start the MSW service worker with safe defaults.
 *  Called from main.tsx via dynamic import so MSW code stays code-split. */
export async function startMocking(): Promise<void> {
  await worker.start({
    onUnhandledRequest: 'bypass',
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

// Apply a scenario by name
export function applyScenario(name: keyof typeof scenarios) {
  const scenarioHandlers = scenarios[name]
  if (scenarioHandlers) {
    worker.use(...scenarioHandlers)
  }
}

// Reset to default handlers
export function resetHandlers() {
  worker.resetHandlers()
}

// Expose MSW controls on window for Playwright tests
if (typeof window !== 'undefined') {
  window.__msw = {
    worker,
    applyScenario,
    resetHandlers,
  }
}
