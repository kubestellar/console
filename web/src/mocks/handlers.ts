/**
 * Main export file for MSW (Mock Service Worker) handlers.
 * 
 * This file re-exports handler arrays for backward compatibility.
 * Implementation is split across:
 * - handlers.fixtures.ts: Data fixtures and timing constants
 * - handlers.endpoints.ts: All MSW HTTP route handlers
 * 
 * IMPORTANT: For tests, use createHandlers() in beforeEach/setup to get fresh
 * state and avoid test contamination (#11020). The static `handlers` export
 * is for backward compatibility only.
 * 
 * Example test setup:
 * ```ts
 * import { createHandlers } from 'mocks/handlers'
 * 
 * beforeEach(() => {
 *   server.resetHandlers(...createHandlers())
 * })
 * ```
 */

export { handlers, scenarios, createHandlers } from './handlers.endpoints'
export {
  kubaraCatalogFixture,
  demoClusters,
  demoPodIssues,
  demoDeploymentIssues,
  demoEvents,
  demoGPUNodes,
  demoSecurityIssues,
  getDefaultUser,
  getDefaultSavedCards,
  getDefaultSharedDashboards,
  // Legacy exports - DEPRECATED, use factory functions above
  currentUser,
  savedCards,
  sharedDashboards,
  pruneRegistry,
  resetShareRegistries,
  getDefaultSavedCards,
  getDefaultSharedDashboards,
  MAX_SHARE_REGISTRY_ENTRIES,
} from './handlers.fixtures'
