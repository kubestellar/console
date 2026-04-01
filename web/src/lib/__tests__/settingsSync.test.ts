import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  collectFromLocalStorage,
  restoreToLocalStorage,
  isLocalStorageEmpty,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_RESTORED_EVENT,
} from '../settingsSync'

describe('event constants', () => {
  it('has expected event names', () => {
    expect(typeof SETTINGS_CHANGED_EVENT).toBe('string')
    expect(typeof SETTINGS_RESTORED_EVENT).toBe('string')
  })
})

describe('collectFromLocalStorage', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns empty object when nothing stored', () => {
    const result = collectFromLocalStorage()
    expect(Object.keys(result).length).toBe(0)
  })

  it('collects aiMode', () => {
    localStorage.setItem('kubestellar-ai-mode', 'high')
    const result = collectFromLocalStorage()
    expect(result.aiMode).toBe('high')
  })

  it('collects theme', () => {
    localStorage.setItem('kubestellar-theme-id', 'dark-purple')
    const result = collectFromLocalStorage()
    expect(result.theme).toBe('dark-purple')
  })

  it('collects predictions as JSON', () => {
    localStorage.setItem('kubestellar-prediction-settings', JSON.stringify({ enabled: true }))
    const result = collectFromLocalStorage()
    expect(result.predictions).toEqual({ enabled: true })
  })

  it('skips invalid JSON gracefully', () => {
    localStorage.setItem('kubestellar-prediction-settings', 'not-json')
    const result = collectFromLocalStorage()
    expect(result.predictions).toBeUndefined()
  })

  it('collects tourCompleted', () => {
    localStorage.setItem('kubestellar-console-tour-completed', 'true')
    const result = collectFromLocalStorage()
    expect(result.tourCompleted).toBe(true)
  })

  it('collects feedbackGithubToken (base64 decoded)', () => {
    localStorage.setItem('feedback_github_token', btoa('ghp_test123'))
    const result = collectFromLocalStorage()
    expect(result.feedbackGithubToken).toBe('ghp_test123')
  })

  it('collects feedbackGithubTokenSource', () => {
    localStorage.setItem('feedback_github_token_source', 'settings')
    const result = collectFromLocalStorage()
    expect(result.feedbackGithubTokenSource).toBe('settings')
  })

  it('ignores invalid feedbackGithubTokenSource', () => {
    localStorage.setItem('feedback_github_token_source', 'invalid')
    const result = collectFromLocalStorage()
    expect(result.feedbackGithubTokenSource).toBeUndefined()
  })

  it('collects keys ending with -stats-config', () => {
    localStorage.setItem('my-stats-config', JSON.stringify([{ id: 1 }]))
    const result = collectFromLocalStorage()
    // 'my-stats-config' ends with '-stats-config', so it is collected
    expect(result.statBlockConfigs?.['my-stats-config']).toEqual([{ id: 1 }])
  })

  it('collects customThemes array', () => {
    const themes = [{ id: 'custom-1', name: 'Custom Theme' }]
    localStorage.setItem('kc-custom-themes', JSON.stringify(themes))
    const result = collectFromLocalStorage()
    expect(result.customThemes).toEqual(themes)
  })

  it('skips empty customThemes array', () => {
    localStorage.setItem('kc-custom-themes', JSON.stringify([]))
    const result = collectFromLocalStorage()
    expect(result.customThemes).toBeUndefined()
  })
})

describe('restoreToLocalStorage', () => {
  beforeEach(() => { localStorage.clear() })

  it('restores aiMode', () => {
    restoreToLocalStorage({ aiMode: 'medium' } as Parameters<typeof restoreToLocalStorage>[0])
    expect(localStorage.getItem('kubestellar-ai-mode')).toBe('medium')
  })

  it('restores theme', () => {
    restoreToLocalStorage({ theme: 'ocean-deep' } as Parameters<typeof restoreToLocalStorage>[0])
    expect(localStorage.getItem('kubestellar-theme-id')).toBe('ocean-deep')
  })

  it('restores predictions as JSON', () => {
    restoreToLocalStorage({ predictions: { enabled: true } } as Parameters<typeof restoreToLocalStorage>[0])
    expect(JSON.parse(localStorage.getItem('kubestellar-prediction-settings')!)).toEqual({ enabled: true })
  })

  it('restores feedbackGithubToken as base64', () => {
    restoreToLocalStorage({ feedbackGithubToken: 'ghp_test' } as Parameters<typeof restoreToLocalStorage>[0])
    expect(atob(localStorage.getItem('feedback_github_token')!)).toBe('ghp_test')
  })

  it('removes legacy github token keys', () => {
    localStorage.setItem('github_token', 'old')
    localStorage.setItem('github_token_source', 'old')
    localStorage.setItem('github_token_dismissed', 'old')
    restoreToLocalStorage({} as Parameters<typeof restoreToLocalStorage>[0])
    expect(localStorage.getItem('github_token')).toBeNull()
    expect(localStorage.getItem('github_token_source')).toBeNull()
    expect(localStorage.getItem('github_token_dismissed')).toBeNull()
  })

  it('restores tourCompleted', () => {
    restoreToLocalStorage({ tourCompleted: true } as Parameters<typeof restoreToLocalStorage>[0])
    expect(localStorage.getItem('kubestellar-console-tour-completed')).toBe('true')
  })

  it('restores statBlockConfigs', () => {
    restoreToLocalStorage({
      statBlockConfigs: { 'my-stats-config': [{ id: 1 }] },
    } as Parameters<typeof restoreToLocalStorage>[0])
    expect(JSON.parse(localStorage.getItem('my-stats-config')!)).toEqual([{ id: 1 }])
  })

  it('dispatches SETTINGS_RESTORED_EVENT', () => {
    const handler = vi.fn()
    window.addEventListener(SETTINGS_RESTORED_EVENT, handler)
    restoreToLocalStorage({} as Parameters<typeof restoreToLocalStorage>[0])
    expect(handler).toHaveBeenCalled()
    window.removeEventListener(SETTINGS_RESTORED_EVENT, handler)
  })
})

describe('isLocalStorageEmpty', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when localStorage is empty', () => {
    expect(isLocalStorageEmpty()).toBe(true)
  })

  it('returns true with fewer than 2 settings', () => {
    localStorage.setItem('kubestellar-ai-mode', 'low')
    expect(isLocalStorageEmpty()).toBe(true)
  })

  it('returns false with 2+ settings', () => {
    localStorage.setItem('kubestellar-ai-mode', 'low')
    localStorage.setItem('kubestellar-theme-id', 'dark')
    expect(isLocalStorageEmpty()).toBe(false)
  })
})
