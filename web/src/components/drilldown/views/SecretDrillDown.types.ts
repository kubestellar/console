export interface SecretDrillDownProps {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'data' | 'describe' | 'yaml'

/** Property names that must never be used as object keys (prototype pollution prevention). */
export const UNSAFE_PROP_NAMES = new Set(['__proto__', 'constructor', 'prototype'])
