# Database Migrations

This directory contains versioned SQL migrations for the console SQLite database.

## Adding a New Migration

1. Create a new `.sql` file with a zero-padded prefix:
   ```
   158_add_feature_flags_table.sql
   ```

2. Write valid SQLite SQL (multiple statements are allowed):
   ```sql
   CREATE TABLE IF NOT EXISTS feature_flags (
       name TEXT PRIMARY KEY,
       enabled INTEGER NOT NULL DEFAULT 0,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
   ```

3. The migration runner applies files in lexicographic order and tracks
   applied versions in the `schema_migrations` table.

## Rules

- **Never modify an existing migration file** — always create a new one.
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotent DDL where possible.
- Keep migrations small and focused (one logical change per file).
- Name files descriptively: `NNN_verb_noun.sql` (e.g., `159_create_audit_events.sql`).
- Migrations run inside a transaction; if any statement fails, the whole
  migration is rolled back.

## Legacy Migrations

Migrations numbered 001–157 correspond to the inline `[]string` slice in
`sqlite_migrations.go`. They are applied by the legacy system on existing
databases. New migrations (158+) use this file-based system.
