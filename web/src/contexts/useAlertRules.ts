import { useState, useEffect, useCallback } from 'react'
import type { AlertRule } from '../types/alerts'
import { PRESET_ALERT_RULES } from '../types/alerts'
import { loadFromStorage, saveToStorage } from './alertStorage'
import { generateId } from './alertRulesEngine'

const ALERT_RULES_KEY = 'kc_alert_rules'

function loadInitialAlertRules(): AlertRule[] {
  const stored = loadFromStorage<AlertRule[]>(ALERT_RULES_KEY, [])
  if (stored.length === 0) {
    const now = new Date().toISOString()
    const presetRules: AlertRule[] = (PRESET_ALERT_RULES as Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>[]).map(preset => ({
      ...preset,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }))
    saveToStorage(ALERT_RULES_KEY, presetRules)
    return presetRules
  }
  return stored
}

/** Alert rule state: loads/persists rules, backfills missing presets, and exposes CRUD callbacks. */
export function useAlertRules() {
  const [rules, setRules] = useState<AlertRule[]>(loadInitialAlertRules)

  useEffect(() => {
    setRules(prev => {
      const existingTypes = new Set(prev.map(rule => rule.condition.type))
      const missing = PRESET_ALERT_RULES.filter(preset => !existingTypes.has(preset.condition.type))
      if (missing.length === 0) return prev
      const now = new Date().toISOString()
      const newRules = missing.map(preset => ({
        ...preset,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      }))
      return [...prev, ...newRules]
    })
  }, [])

  useEffect(() => {
    saveToStorage(ALERT_RULES_KEY, rules)
  }, [rules])

  const createRule = useCallback((rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()
    const newRule: AlertRule = {
      ...rule,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    setRules(prev => [...prev, newRule])
    return newRule
  }, [])

  const updateRule = useCallback((id: string, updates: Partial<AlertRule>) => {
    setRules(prev =>
      prev.map(rule =>
        rule.id === id
          ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
          : rule
      )
    )
  }, [])

  const deleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(rule => rule.id !== id))
  }, [])

  const toggleRule = useCallback((id: string) => {
    setRules(prev =>
      prev.map(rule =>
        rule.id === id
          ? { ...rule, enabled: !rule.enabled, updatedAt: new Date().toISOString() }
          : rule
      )
    )
  }, [])

  return { rules, createRule, updateRule, deleteRule, toggleRule }
}
