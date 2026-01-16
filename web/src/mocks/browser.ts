import { setupWorker } from 'msw/browser'
import { handlers, scenarios } from './handlers'

// Create MSW worker
export const worker = setupWorker(...handlers)

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
