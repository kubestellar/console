import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  updateAnalyticsIds,
  setAnalyticsUserProperties,
  setAnalyticsOptOut,
  isAnalyticsOptedOut,
  emitPageView,
  emitCardAdded,
  emitCardRemoved,
  emitCardExpanded,
  emitCardDragged,
  emitCardConfigured,
  emitCardReplaced,
  emitLogin,
  emitLogout,
  emitFeedbackSubmitted,
  emitError,
  markErrorReported,
  emitTourStarted,
  emitTourCompleted,
  emitTourSkipped,
  emitMarketplaceInstall,
  emitMarketplaceRemove,
  emitThemeChanged,
  emitLanguageChanged,
  emitSessionExpired,
  emitGlobalSearchOpened,
  emitGlobalSearchQueried,
  emitConversionStep,
  emitAgentConnected,
  emitAgentDisconnected,
  emitClusterInventory,
  emitBenchmarkViewed,
  emitDashboardCreated,
  emitDashboardDeleted,
  emitDashboardImported,
  emitDashboardExported,
  emitDashboardRenamed,
  emitUpdateChecked,
  emitUpdateTriggered,
  emitDrillDownOpened,
  emitDrillDownClosed,
  emitCardRefreshed,
  emitGlobalClusterFilterChanged,
  emitSnoozed,
  emitUnsnoozed,
  emitWidgetLoaded,
  emitGameStarted,
  emitGameEnded,
  emitSidebarNavigated,
  emitLocalClusterCreated,
  emitAdopterNudgeShown,
  emitNudgeShown,
  emitLinkedInShare,
  emitModalOpened,
  emitModalClosed,
  emitWelcomeViewed,
  emitWelcomeActioned,
  emitFromLensViewed,
  emitWhiteLabelViewed,
  emitTipShown,
  emitStreakDay,
  getUtmParams,
  emitAgentProvidersDetected,
} from '../analytics'

describe('analytics module', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('all emit functions are callable without throwing', () => {
    // These all call send() internally, which gates on initialized/opted-out
    // They should never throw even when analytics is not initialized
    expect(() => emitPageView('/test')).not.toThrow()
    expect(() => emitCardAdded('test', 'manual')).not.toThrow()
    expect(() => emitCardRemoved('test')).not.toThrow()
    expect(() => emitCardExpanded('test')).not.toThrow()
    expect(() => emitCardDragged('test')).not.toThrow()
    expect(() => emitCardConfigured('test')).not.toThrow()
    expect(() => emitCardReplaced('old', 'new')).not.toThrow()
    expect(() => emitLogin('github')).not.toThrow()
    expect(() => emitLogout()).not.toThrow()
    expect(() => emitFeedbackSubmitted('bug')).not.toThrow()
    expect(() => emitError('test', 'detail')).not.toThrow()
    expect(() => emitTourStarted()).not.toThrow()
    expect(() => emitTourCompleted(5)).not.toThrow()
    expect(() => emitTourSkipped(2)).not.toThrow()
    expect(() => emitMarketplaceInstall('card', 'test')).not.toThrow()
    expect(() => emitMarketplaceRemove('card')).not.toThrow()
    expect(() => emitThemeChanged('dark', 'settings')).not.toThrow()
    expect(() => emitLanguageChanged('en')).not.toThrow()
    expect(() => emitSessionExpired()).not.toThrow()
    expect(() => emitGlobalSearchOpened('keyboard')).not.toThrow()
    expect(() => emitGlobalSearchQueried(5, 10)).not.toThrow()
    expect(() => emitConversionStep(1, 'discovery')).not.toThrow()
    expect(() => emitAgentConnected('1.0', 3)).not.toThrow()
    expect(() => emitAgentDisconnected()).not.toThrow()
    expect(() => emitBenchmarkViewed('latency')).not.toThrow()
    expect(() => emitDashboardCreated('test')).not.toThrow()
    expect(() => emitDashboardDeleted()).not.toThrow()
    expect(() => emitDashboardRenamed()).not.toThrow()
    expect(() => emitDashboardImported()).not.toThrow()
    expect(() => emitDashboardExported()).not.toThrow()
    expect(() => emitUpdateChecked()).not.toThrow()
    expect(() => emitUpdateTriggered()).not.toThrow()
    expect(() => emitDrillDownOpened('pod')).not.toThrow()
    expect(() => emitDrillDownClosed('pod', 1)).not.toThrow()
    expect(() => emitCardRefreshed('test')).not.toThrow()
    expect(() => emitGlobalClusterFilterChanged(3, 5)).not.toThrow()
    expect(() => emitSnoozed('card', '1h')).not.toThrow()
    expect(() => emitUnsnoozed('card')).not.toThrow()
    expect(() => emitWidgetLoaded('standalone')).not.toThrow()
    expect(() => emitGameStarted('tetris')).not.toThrow()
    expect(() => emitGameEnded('tetris', 'win', 100)).not.toThrow()
    expect(() => emitSidebarNavigated('/clusters')).not.toThrow()
    expect(() => emitLocalClusterCreated('kind')).not.toThrow()
    expect(() => emitAdopterNudgeShown()).not.toThrow()
    expect(() => emitNudgeShown('test')).not.toThrow()
    expect(() => emitLinkedInShare('dashboard')).not.toThrow()
    expect(() => emitModalOpened('pod', 'pod_issues')).not.toThrow()
    expect(() => emitModalClosed('pod', 5000)).not.toThrow()
    expect(() => emitWelcomeViewed('test')).not.toThrow()
    expect(() => emitWelcomeActioned('click', 'test')).not.toThrow()
    expect(() => emitFromLensViewed()).not.toThrow()
    expect(() => emitWhiteLabelViewed()).not.toThrow()
    expect(() => emitTipShown('dashboard', 'tip1')).not.toThrow()
    expect(() => emitStreakDay(5)).not.toThrow()
  })
})

describe('markErrorReported', () => {
  it('does not throw', () => {
    expect(() => markErrorReported('test error')).not.toThrow()
  })
})

describe('updateAnalyticsIds', () => {
  it('does not throw with valid IDs', () => {
    expect(() => updateAnalyticsIds({
      ga4MeasurementId: 'G-TEST123',
      umamiWebsiteId: 'test-id',
    })).not.toThrow()
  })

  it('handles empty overrides', () => {
    expect(() => updateAnalyticsIds({})).not.toThrow()
  })
})

describe('setAnalyticsUserProperties', () => {
  it('does not throw', () => {
    expect(() => setAnalyticsUserProperties({ test: 'value' })).not.toThrow()
  })
})

describe('opt-out', () => {
  beforeEach(() => { localStorage.clear() })

  it('isAnalyticsOptedOut returns false by default', () => {
    expect(isAnalyticsOptedOut()).toBe(false)
  })

  it('setAnalyticsOptOut sets the flag', () => {
    setAnalyticsOptOut(true)
    expect(isAnalyticsOptedOut()).toBe(true)
  })

  it('setAnalyticsOptOut can re-enable', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(isAnalyticsOptedOut()).toBe(false)
  })
})

describe('getUtmParams', () => {
  it('returns a copy of UTM params', () => {
    const params = getUtmParams()
    expect(typeof params).toBe('object')
  })
})

describe('emitClusterInventory', () => {
  it('does not throw', () => {
    expect(() => emitClusterInventory({
      total: 5,
      healthy: 4,
      unhealthy: 1,
      unreachable: 0,
      distributions: { eks: 2, gke: 3 },
    })).not.toThrow()
  })
})

describe('emitAgentProvidersDetected', () => {
  it('does not throw with providers', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
      { name: 'claude', displayName: 'Claude', capabilities: 3 },
    ])).not.toThrow()
  })

  it('does not throw with empty array', () => {
    expect(() => emitAgentProvidersDetected([])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// NEW TESTS — regression-preventing coverage for untested behaviors
// ---------------------------------------------------------------------------

describe('opt-out localStorage persistence', () => {
  const OPT_OUT_KEY = 'kc-analytics-opt-out'

  beforeEach(() => { localStorage.clear() })

  it('opt-out persists the value "true" in localStorage', () => {
    setAnalyticsOptOut(true)
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('true')
  })

  it('opt-in persists the value "false" in localStorage', () => {
    setAnalyticsOptOut(true)
    setAnalyticsOptOut(false)
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('false')
  })

  it('opt-out clears session-related localStorage keys', () => {
    // Simulate session keys that the analytics module manages
    localStorage.setItem('_ksc_cid', 'test-cid')
    localStorage.setItem('_ksc_sid', 'test-sid')
    localStorage.setItem('_ksc_sc', '1')
    localStorage.setItem('_ksc_last', '12345')

    setAnalyticsOptOut(true)

    expect(localStorage.getItem('_ksc_cid')).toBeNull()
    expect(localStorage.getItem('_ksc_sid')).toBeNull()
    expect(localStorage.getItem('_ksc_sc')).toBeNull()
    expect(localStorage.getItem('_ksc_last')).toBeNull()
  })

  it('opt-out dispatches kubestellar-settings-changed event', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)
    try {
      setAnalyticsOptOut(true)
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', handler)
    }
  })

  it('opt-in dispatches kubestellar-settings-changed event', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)
    try {
      setAnalyticsOptOut(false)
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', handler)
    }
  })
})
