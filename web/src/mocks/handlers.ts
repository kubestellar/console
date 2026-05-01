/**
 * Main export file for MSW (Mock Service Worker) handlers.
 * 
 * This file re-exports handler arrays for backward compatibility.
 * Implementation is split across:
 * - handlers.fixtures.ts: Data fixtures and timing constants
 * - handlers.endpoints.ts: All MSW HTTP route handlers
 * 
 * Existing imports like `import { handlers } from 'mocks/handlers'` continue to work unchanged.
 */

export { handlers, scenarios } from './handlers.endpoints'
export {
  kubaraCatalogFixture,
  demoClusters,
  demoPodIssues,
  demoDeploymentIssues,
  demoEvents,
  demoGPUNodes,
  demoSecurityIssues,
  currentUser,
  savedCards,
  sharedDashboards,
  pruneRegistry,
  resetShareRegistries,
  getDefaultSavedCards,
  getDefaultSharedDashboards,
  MAX_SHARE_REGISTRY_ENTRIES,
} from './handlers.fixtures'
