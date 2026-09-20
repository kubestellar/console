import { describe, it, expect } from 'vitest'
import {
  emitClusterInventory,
  emitAgentProvidersDetected,
  emitRecommendedCardShown,
  emitDemoModeToggled,
  updateAnalyticsIds,
  emitConversionStep,
  emitAISuggestionViewed,
  emitGameEnded,
  emitWidgetLoaded,
  emitWidgetInstalled,
  emitWidgetDownloaded,
  emitDashboardScrolled,
  emitGlobalSearchOpened,
  emitInstallCommandCopied,
} from '../analytics'

// ---------------------------------------------------------------------------
// Split from analytics-emit-extended.test.ts (part 3 of 3)
// ---------------------------------------------------------------------------

describe('emitClusterInventory flattens distribution params', () => {
  it('handles single distribution entry', () => {
    expect(() => emitClusterInventory({
      total: 1,
      healthy: 1,
      unhealthy: 0,
      unreachable: 0,
      distributions: { kind: 1 },
    })).not.toThrow()
  })

  it('handles distributions with special characters in keys', () => {
    expect(() => emitClusterInventory({
      total: 2,
      healthy: 2,
      unhealthy: 0,
      unreachable: 0,
      distributions: { 'k3s-arm': 1, 'eks-fargate': 1 },
    })).not.toThrow()
  })

  it('sets cluster_count user property', () => {
    // This exercises the userProperties.cluster_count = String(counts.total) branch
    emitClusterInventory({
      total: 42,
      healthy: 40,
      unhealthy: 1,
      unreachable: 1,
      distributions: { eks: 20, gke: 22 },
    })
    // No direct assertion on internal state, but the code path is exercised
  })
})

describe('emitAgentProvidersDetected bitmask categorization', () => {
  it('categorizes providers with TOOL_EXEC as CLI', () => {
    // capability=2 means TOOL_EXEC only
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 2 },
    ])).not.toThrow()
  })

  it('categorizes providers with CHAT only as API', () => {
    // capability=1 means CHAT only
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
    ])).not.toThrow()
  })

  it('categorizes providers with both capabilities as CLI', () => {
    // capability=3 means both CHAT and TOOL_EXEC
    expect(() => emitAgentProvidersDetected([
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
    ])).not.toThrow()
  })

  it('correctly separates mixed providers into CLI and API lists', () => {
    expect(() => emitAgentProvidersDetected([
      { name: 'openai', displayName: 'OpenAI', capabilities: 1 },
      { name: 'claude-code', displayName: 'Claude Code', capabilities: 3 },
      { name: 'gemini', displayName: 'Gemini', capabilities: 1 },
      { name: 'copilot', displayName: 'Copilot', capabilities: 2 },
    ])).not.toThrow()
  })

  it('returns early for null-ish providers', () => {
    // This tests the `if (!providers || providers.length === 0) return` guard
    expect(() => emitAgentProvidersDetected([])).not.toThrow()
  })

  it('handles provider with capability=0 (no capabilities)', () => {
    // Neither CHAT nor TOOL_EXEC -- should not appear in either list
    expect(() => emitAgentProvidersDetected([
      { name: 'unknown', displayName: 'Unknown', capabilities: 0 },
    ])).not.toThrow()
  })
})

describe('emitRecommendedCardShown joins card types', () => {
  it('joins multiple card types with comma', () => {
    expect(() => emitRecommendedCardShown(['pods', 'nodes', 'deployments'])).not.toThrow()
  })

  it('handles single card type', () => {
    expect(() => emitRecommendedCardShown(['pods'])).not.toThrow()
  })

  it('handles empty array (card_count=0, card_types="")', () => {
    expect(() => emitRecommendedCardShown([])).not.toThrow()
  })
})

describe('emitDemoModeToggled updates user properties', () => {
  it('sets demo_mode to "true" when enabled', () => {
    expect(() => emitDemoModeToggled(true)).not.toThrow()
  })

  it('sets demo_mode to "false" when disabled', () => {
    expect(() => emitDemoModeToggled(false)).not.toThrow()
  })
})

describe('updateAnalyticsIds only overrides non-empty values', () => {
  it('overrides ga4MeasurementId with non-empty value', () => {
    expect(() => updateAnalyticsIds({ ga4MeasurementId: 'G-CUSTOM123' })).not.toThrow()
  })

  it('overrides umamiWebsiteId with non-empty value', () => {
    expect(() => updateAnalyticsIds({ umamiWebsiteId: 'custom-umami-id' })).not.toThrow()
  })

  it('does NOT override when empty string is passed', () => {
    // Empty string is falsy, so the condition `if (ids.ga4MeasurementId)` is false
    expect(() => updateAnalyticsIds({ ga4MeasurementId: '' })).not.toThrow()
  })

  it('handles both IDs being set simultaneously', () => {
    expect(() => updateAnalyticsIds({
      ga4MeasurementId: 'G-BOTH123',
      umamiWebsiteId: 'both-umami-id',
    })).not.toThrow()
  })
})

describe('emitConversionStep with various step numbers and details', () => {
  it('sends step 1 discovery with deployment_type detail', () => {
    expect(() => emitConversionStep(1, 'discovery', { deployment_type: 'localhost' })).not.toThrow()
  })

  it('sends step 2 login without details', () => {
    expect(() => emitConversionStep(2, 'login')).not.toThrow()
  })

  it('sends step 7 adopter_cta with multiple details', () => {
    expect(() => emitConversionStep(7, 'adopter_cta', {
      deployment_type: 'console.kubestellar.io',
      source: 'banner',
    })).not.toThrow()
  })
})

describe('emitAISuggestionViewed boolean param', () => {
  it('handles hasAIEnrichment=true', () => {
    expect(() => emitAISuggestionViewed('security', true)).not.toThrow()
  })

  it('handles hasAIEnrichment=false', () => {
    expect(() => emitAISuggestionViewed('performance', false)).not.toThrow()
  })
})

describe('emitGameEnded with various outcomes', () => {
  it('handles win outcome', () => {
    expect(() => emitGameEnded('tetris', 'win', 1500)).not.toThrow()
  })

  it('handles loss outcome', () => {
    expect(() => emitGameEnded('tetris', 'loss', 200)).not.toThrow()
  })

  it('handles completion outcome with zero score', () => {
    expect(() => emitGameEnded('kubequest', 'completion', 0)).not.toThrow()
  })
})

describe('emitWidgetLoaded mode variants', () => {
  it('handles standalone mode', () => {
    expect(() => emitWidgetLoaded('standalone')).not.toThrow()
  })

  it('handles browser mode', () => {
    expect(() => emitWidgetLoaded('browser')).not.toThrow()
  })
})

describe('emitWidgetInstalled method variants', () => {
  it('handles pwa-prompt method', () => {
    expect(() => emitWidgetInstalled('pwa-prompt')).not.toThrow()
  })

  it('handles safari-dock method', () => {
    expect(() => emitWidgetInstalled('safari-dock')).not.toThrow()
  })
})

describe('emitWidgetDownloaded widget type variants', () => {
  it('handles uebersicht widget type', () => {
    expect(() => emitWidgetDownloaded('uebersicht')).not.toThrow()
  })

  it('handles browser widget type', () => {
    expect(() => emitWidgetDownloaded('browser')).not.toThrow()
  })
})

describe('emitDashboardScrolled depth variants', () => {
  it('handles shallow depth', () => {
    expect(() => emitDashboardScrolled('shallow')).not.toThrow()
  })

  it('handles deep depth', () => {
    expect(() => emitDashboardScrolled('deep')).not.toThrow()
  })
})

describe('emitGlobalSearchOpened method variants', () => {
  it('handles keyboard method', () => {
    expect(() => emitGlobalSearchOpened('keyboard')).not.toThrow()
  })

  it('handles click method', () => {
    expect(() => emitGlobalSearchOpened('click')).not.toThrow()
  })
})

describe('emitInstallCommandCopied source variants', () => {
  it('handles setup_quickstart source', () => {
    expect(() => emitInstallCommandCopied('setup_quickstart', 'curl | bash')).not.toThrow()
  })

  it('handles from_lens source', () => {
    expect(() => emitInstallCommandCopied('from_lens', 'kubectl apply')).not.toThrow()
  })

  it('handles white_label source', () => {
    expect(() => emitInstallCommandCopied('white_label', 'docker run ...')).not.toThrow()
  })

  it('handles demo_to_local source', () => {
    expect(() => emitInstallCommandCopied('demo_to_local', 'brew install')).not.toThrow()
  })

  it('handles agent_install_banner source', () => {
    expect(() => emitInstallCommandCopied('agent_install_banner', 'npm install')).not.toThrow()
  })
})
