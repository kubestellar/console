/**
 * Theme storage utilities for custom themes
 */

import type { Theme } from './types'
import { STORAGE_KEY_CUSTOM_THEMES } from '../constants/storage'

export function getCustomThemes(): Theme[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_THEMES) || '[]')
  } catch {
    return []
  }
}

export function addCustomTheme(theme: Theme): void {
  const customs = getCustomThemes().filter(t => t.id !== theme.id)
  customs.push(theme)
  localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(customs))
}

export function removeCustomTheme(themeId: string): void {
  const customs = getCustomThemes().filter(t => t.id !== themeId)
  localStorage.setItem(STORAGE_KEY_CUSTOM_THEMES, JSON.stringify(customs))
}
