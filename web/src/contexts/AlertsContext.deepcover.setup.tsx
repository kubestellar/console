import React from 'react'
import { AlertsProvider } from './AlertsContext'
import type { Alert, AlertRule } from '../types/alerts'

// Shared test helpers for the AlertsContext.deepcover.*.test.tsx split files.
// vi.mock() calls cannot live here (they must be hoisted per-file by vitest),
// so each test file re-declares its own mocks and only imports these helpers.

export const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AlertsProvider>{children}</AlertsProvider>
)

/**
 * Safely seed localStorage in tests. Wraps setItem in try/catch so a
 * throwing storage backend (private browsing, quota, spies that reject)
 * never masks the real assertion failure with a setup crash.
 */
export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    console.error(`[test] safeSetItem failed for key "${key}":`, err)
  }
}

/** Safely read localStorage in tests, returning null on any error. */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (err) {
    console.error(`[test] safeGetItem failed for key "${key}":`, err)
    return null
  }
}

/** Build a minimal Alert object for seeding localStorage. */
export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: overrides.ruleId ?? 'rule-1',
    ruleName: overrides.ruleName ?? 'Test Rule',
    severity: overrides.severity ?? 'warning',
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'Test alert message',
    details: overrides.details ?? {},
    firedAt: overrides.firedAt ?? new Date().toISOString(),
    resolvedAt: overrides.resolvedAt,
    ...overrides,
  }
}

/** Build a minimal AlertRule for testing rule management. */
export function makeRule(
  overrides: Partial<Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>> = {}
): Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: overrides.name ?? 'Test Rule',
    description: overrides.description ?? 'A test rule',
    enabled: overrides.enabled ?? true,
    condition: overrides.condition ?? { type: 'gpu_usage', threshold: 90 },
    severity: overrides.severity ?? 'warning',
    channels: overrides.channels ?? [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: overrides.aiDiagnose ?? false,
  }
}
