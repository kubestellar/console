/**
 * TUF (The Update Framework) Status Card — Demo Data & Type Definitions
 *
 * Models the four TUF top-level roles — root, targets, snapshot, timestamp —
 * with version numbers, expiration timestamps, threshold/keys, and metadata
 * file signing status. TUF is a CNCF graduated secure software update
 * framework; operators care about role rotation cadence and that no role
 * metadata has expired or is about to expire.
 */

import { MS_PER_DAY } from '../constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical TUF top-level role names. */
export type TufRoleName = 'root' | 'targets' | 'snapshot' | 'timestamp'

/** Signing status of a given role's metadata file. */
export type TufMetadataStatus = 'signed' | 'unsigned' | 'expired' | 'expiring-soon'

export interface TufRole {
  name: TufRoleName
  /** Current version of this role's metadata (monotonically increasing). */
  version: number
  /** ISO timestamp when this role's signed metadata expires. */
  expiresAt: string
  /** Number of signatures required to validate the metadata file. */
  threshold: number
  /** Number of keys configured on this role. */
  keyCount: number
  /** Signing status derived from expiresAt + signature verification. */
  status: TufMetadataStatus
}

export interface TufSummary {
  totalRoles: number
  signedRoles: number
  expiredRoles: number
  expiringSoonRoles: number
}

export type TufHealth = 'healthy' | 'degraded' | 'not-installed'

export interface TufStatusData {
  health: TufHealth
  /** Current TUF specification version this repository targets. */
  specVersion: string
  /** Repository URL or identifier (for display only). */
  repository: string
  roles: TufRole[]
  summary: TufSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when TUF is not installed or in demo mode
// ---------------------------------------------------------------------------

// Named constants (no magic numbers)

// Role expiration offsets (days from "now") chosen to mirror realistic TUF
// cadence: timestamp rotates daily, snapshot weekly, targets monthly, root yearly.
const ROOT_EXPIRES_IN_DAYS = 312
const TARGETS_EXPIRES_IN_DAYS = 27
const SNAPSHOT_EXPIRES_IN_DAYS = 5
// Demo timestamp role intentionally flagged as expiring-soon to exercise the
// warning path in the card UI.
const TIMESTAMP_EXPIRES_IN_DAYS = 1

// Role version numbers (monotonic, chosen to feel realistic)
const ROOT_ROLE_VERSION = 4
const TARGETS_ROLE_VERSION = 38
const SNAPSHOT_ROLE_VERSION = 212
const TIMESTAMP_ROLE_VERSION = 1487

// Thresholds / key counts per role (typical production TUF layout)
const ROOT_ROLE_THRESHOLD = 3
const ROOT_ROLE_KEY_COUNT = 5
const TARGETS_ROLE_THRESHOLD = 1
const TARGETS_ROLE_KEY_COUNT = 2
const SNAPSHOT_ROLE_THRESHOLD = 1
const SNAPSHOT_ROLE_KEY_COUNT = 1
const TIMESTAMP_ROLE_THRESHOLD = 1
const TIMESTAMP_ROLE_KEY_COUNT = 1

const DEMO_SPEC_VERSION = '1.0.32'
const DEMO_REPOSITORY = 'tuf-repo.kubestellar.demo'

function addDays(baseMs: number, days: number): string {
  return new Date(baseMs + days * MS_PER_DAY).toISOString()
}

const NOW_MS = Date.now()

const DEMO_ROLES: TufRole[] = [
  {
    name: 'root',
    version: ROOT_ROLE_VERSION,
    expiresAt: addDays(NOW_MS, ROOT_EXPIRES_IN_DAYS),
    threshold: ROOT_ROLE_THRESHOLD,
    keyCount: ROOT_ROLE_KEY_COUNT,
    status: 'signed',
  },
  {
    name: 'targets',
    version: TARGETS_ROLE_VERSION,
    expiresAt: addDays(NOW_MS, TARGETS_EXPIRES_IN_DAYS),
    threshold: TARGETS_ROLE_THRESHOLD,
    keyCount: TARGETS_ROLE_KEY_COUNT,
    status: 'signed',
  },
  {
    name: 'snapshot',
    version: SNAPSHOT_ROLE_VERSION,
    expiresAt: addDays(NOW_MS, SNAPSHOT_EXPIRES_IN_DAYS),
    threshold: SNAPSHOT_ROLE_THRESHOLD,
    keyCount: SNAPSHOT_ROLE_KEY_COUNT,
    status: 'signed',
  },
  {
    name: 'timestamp',
    version: TIMESTAMP_ROLE_VERSION,
    expiresAt: addDays(NOW_MS, TIMESTAMP_EXPIRES_IN_DAYS),
    threshold: TIMESTAMP_ROLE_THRESHOLD,
    keyCount: TIMESTAMP_ROLE_KEY_COUNT,
    status: 'expiring-soon',
  },
]

const DEMO_SIGNED_ROLES = DEMO_ROLES.filter(r => r.status === 'signed').length
const DEMO_EXPIRED_ROLES = DEMO_ROLES.filter(r => r.status === 'expired').length
const DEMO_EXPIRING_SOON_ROLES = DEMO_ROLES.filter(
  r => r.status === 'expiring-soon',
).length

export const TUF_DEMO_DATA: TufStatusData = {
  health: 'degraded',
  specVersion: DEMO_SPEC_VERSION,
  repository: DEMO_REPOSITORY,
  roles: DEMO_ROLES,
  summary: {
    totalRoles: DEMO_ROLES.length,
    signedRoles: DEMO_SIGNED_ROLES,
    expiredRoles: DEMO_EXPIRED_ROLES,
    expiringSoonRoles: DEMO_EXPIRING_SOON_ROLES,
  },
  lastCheckTime: new Date().toISOString(),
}
