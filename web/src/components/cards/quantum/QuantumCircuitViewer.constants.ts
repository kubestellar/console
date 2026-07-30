// Constants for QuantumCircuitViewer split into a leaf module so the e2e
// visual test can import them without pulling in app-level transitive
// dependencies (logger, vite import.meta.env, etc.) that don't resolve under
// Playwright's Node runtime.
export const CIRCUIT_ZOOM_STORAGE_KEY = 'quantum-circuit-zoom'
