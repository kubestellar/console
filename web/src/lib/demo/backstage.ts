/**
 * Backstage Status Card — Demo Data & Type Definitions
 *
 * Backstage is a CNCF incubating developer portal platform. Operators care
 * about: replica count (the Backstage app deployment), catalog entity
 * inventory (Components / APIs / Systems / Domains / Resources / Users /
 * Groups), installed plugins, scaffolder templates, and the last time the
 * entity catalog was successfully reconciled.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Overall health roll-up for the Backstage instance. */
export type BackstageHealth = 'healthy' | 'degraded' | 'not-installed'

/** Status of a single Backstage plugin install. */
export type BackstagePluginStatus = 'enabled' | 'disabled' | 'error'

/** Canonical Backstage catalog entity kinds surfaced in the card. */
export type BackstageEntityKind =
  | 'Component'
  | 'API'
  | 'System'
  | 'Domain'
  | 'Resource'
  | 'User'
  | 'Group'

/**
 * Per-kind entity counts. Keys are the exact `kind` strings Backstage uses
 * in its catalog; the card renders them in the declared order.
 */
export type BackstageCatalogCounts = Record<BackstageEntityKind, number>

export interface BackstagePlugin {
  /** Plugin package name, e.g. "@backstage/plugin-techdocs". */
  name: string
  /** Installed version. */
  version: string
  status: BackstagePluginStatus
}

export interface BackstageScaffolderTemplate {
  /** Template `metadata.name`. */
  name: string
  /** Template owner (team or user ref). */
  owner: string
  /** Type, e.g. "service", "website", "library". */
  type: string
}

export interface BackstageSummary {
  /** Total catalog entities across all kinds. */
  totalEntities: number
  /** Number of plugins in status === 'enabled'. */
  enabledPlugins: number
  /** Number of plugins in status === 'error'. */
  pluginErrors: number
  /** Total scaffolder templates known to the instance. */
  scaffolderTemplates: number
}

export interface BackstageStatusData {
  health: BackstageHealth
  /** Backstage app semver, e.g. "1.32.0". */
  version: string
  /** Running replica count for the Backstage app deployment. */
  replicas: number
  /** Desired replica count (from the Deployment spec). */
  desiredReplicas: number
  /** Per-entity-kind counts. */
  catalog: BackstageCatalogCounts
  /** Installed plugins (subset surfaced in the card). */
  plugins: BackstagePlugin[]
  /** Registered scaffolder templates. */
  templates: BackstageScaffolderTemplate[]
  /** ISO timestamp of the last successful catalog reconciliation. */
  lastCatalogSync: string
  /** ISO timestamp this snapshot was taken. */
  lastCheckTime: string
  summary: BackstageSummary
}

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR

// Demo replica topology — typical small-to-medium Backstage install.
const DEMO_REPLICAS_RUNNING = 2
const DEMO_REPLICAS_DESIRED = 2

// Demo catalog counts — shaped like a realistic mid-size platform team
// (lots of Components, a few Systems, several APIs backing them, etc.).
const DEMO_COMPONENT_COUNT = 184
const DEMO_API_COUNT = 62
const DEMO_SYSTEM_COUNT = 17
const DEMO_DOMAIN_COUNT = 5
const DEMO_RESOURCE_COUNT = 31
const DEMO_USER_COUNT = 148
const DEMO_GROUP_COUNT = 24

// Demo catalog sync freshness — 12 minutes ago feels healthy and in-line
// with the default 100s catalog processor interval rounded up to the
// next poll cycle observed by an operator.
const DEMO_CATALOG_SYNC_MINUTES_AGO = 12

// Demo snapshot freshness — 1 minute ago.
const DEMO_SNAPSHOT_MINUTES_AGO = 1

const DEMO_VERSION = '1.32.0'

// ---------------------------------------------------------------------------
// Demo plugins
// ---------------------------------------------------------------------------

const DEMO_PLUGINS: BackstagePlugin[] = [
  { name: '@backstage/plugin-catalog', version: '1.21.0', status: 'enabled' },
  { name: '@backstage/plugin-techdocs', version: '1.11.3', status: 'enabled' },
  { name: '@backstage/plugin-scaffolder', version: '1.24.1', status: 'enabled' },
  { name: '@backstage/plugin-kubernetes', version: '0.17.2', status: 'enabled' },
  { name: '@backstage/plugin-search', version: '1.4.17', status: 'enabled' },
  { name: '@roadiehq/backstage-plugin-github-insights', version: '2.3.28', status: 'error' },
]

// ---------------------------------------------------------------------------
// Demo scaffolder templates
// ---------------------------------------------------------------------------

const DEMO_TEMPLATES: BackstageScaffolderTemplate[] = [
  { name: 'nodejs-service', owner: 'platform-team', type: 'service' },
  { name: 'react-spa', owner: 'frontend-team', type: 'website' },
  { name: 'grpc-go-service', owner: 'platform-team', type: 'service' },
  { name: 'shared-library', owner: 'platform-team', type: 'library' },
  { name: 'data-pipeline', owner: 'data-platform', type: 'pipeline' },
]

// ---------------------------------------------------------------------------
// Build demo snapshot
// ---------------------------------------------------------------------------

const NOW_MS = Date.now()

const DEMO_CATALOG: BackstageCatalogCounts = {
  Component: DEMO_COMPONENT_COUNT,
  API: DEMO_API_COUNT,
  System: DEMO_SYSTEM_COUNT,
  Domain: DEMO_DOMAIN_COUNT,
  Resource: DEMO_RESOURCE_COUNT,
  User: DEMO_USER_COUNT,
  Group: DEMO_GROUP_COUNT,
}

const DEMO_TOTAL_ENTITIES =
  DEMO_COMPONENT_COUNT +
  DEMO_API_COUNT +
  DEMO_SYSTEM_COUNT +
  DEMO_DOMAIN_COUNT +
  DEMO_RESOURCE_COUNT +
  DEMO_USER_COUNT +
  DEMO_GROUP_COUNT

const DEMO_ENABLED_PLUGIN_COUNT = DEMO_PLUGINS.filter(p => p.status === 'enabled').length
const DEMO_PLUGIN_ERROR_COUNT = DEMO_PLUGINS.filter(p => p.status === 'error').length

export const BACKSTAGE_DEMO_DATA: BackstageStatusData = {
  // One plugin in `error` status → degraded to exercise the warning UI path.
  health: 'degraded',
  version: DEMO_VERSION,
  replicas: DEMO_REPLICAS_RUNNING,
  desiredReplicas: DEMO_REPLICAS_DESIRED,
  catalog: DEMO_CATALOG,
  plugins: DEMO_PLUGINS,
  templates: DEMO_TEMPLATES,
  lastCatalogSync: new Date(
    NOW_MS - DEMO_CATALOG_SYNC_MINUTES_AGO * MS_PER_MINUTE,
  ).toISOString(),
  lastCheckTime: new Date(NOW_MS - DEMO_SNAPSHOT_MINUTES_AGO * MS_PER_MINUTE).toISOString(),
  summary: {
    totalEntities: DEMO_TOTAL_ENTITIES,
    enabledPlugins: DEMO_ENABLED_PLUGIN_COUNT,
    pluginErrors: DEMO_PLUGIN_ERROR_COUNT,
    scaffolderTemplates: DEMO_TEMPLATES.length,
  },
}

// Exported so the hook (and unit tests) can reference the same canonical
// kind ordering the card renders.
export const BACKSTAGE_ENTITY_KINDS: readonly BackstageEntityKind[] = [
  'Component',
  'API',
  'System',
  'Domain',
  'Resource',
  'User',
  'Group',
]

// Re-export MS_PER_HOUR so the hook's "stale catalog" window can share the
// same unit definitions without redeclaring them.
export const BACKSTAGE_MS_PER_HOUR = MS_PER_HOUR
