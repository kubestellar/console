/**
 * Shared time-unit constants used across hooks, cards, and demo data.
 *
 * Consolidates the ~70 duplicate `MS_PER_*` / `SECONDS_PER_*` definitions
 * that were scattered across the codebase.
 */

export const MS_PER_SECOND = 1_000
export const SECONDS_PER_MINUTE = 60
export const MINUTES_PER_HOUR = 60
export const HOURS_PER_DAY = 24

export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR
export const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY
