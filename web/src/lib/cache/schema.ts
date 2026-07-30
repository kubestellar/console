/**
 * SQLite schema for the client-side cache database.
 *
 * Three tables:
 * - cache_data: replaces IndexedDB 'kc_cache' store (large K8s data)
 * - cache_meta: replaces localStorage 'kc_meta:*' keys (failure tracking)
 * - preferences: replaces localStorage 'kubestellar-pref:*' keys (small config)
 */

export const SCHEMA_VERSION = 1

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS cache_data (
    key          TEXT PRIMARY KEY,
    data         TEXT NOT NULL,
    timestamp    INTEGER NOT NULL,
    version      INTEGER NOT NULL,
    size_bytes   INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_cache_timestamp ON cache_data(timestamp);

  CREATE TABLE IF NOT EXISTS cache_meta (
    key                     TEXT PRIMARY KEY,
    consecutive_failures    INTEGER DEFAULT 0,
    last_error              TEXT,
    last_successful_refresh INTEGER
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`
