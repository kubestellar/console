/**
 * UnifiedStatsSection Test Page
 *
 * Compares UnifiedStatsSection rendering vs legacy StatsOverview
 * to validate the unified framework works correctly.
 */

import { useCallback } from 'react'
import { Trans } from 'react-i18next'
import { UnifiedStatsSection } from '../lib/unified/stats/UnifiedStatsSection'
import { COMPUTE_STATS_CONFIG } from '../lib/unified/stats/configs'
import { StatsOverview, StatBlockValue } from '../components/ui/StatsOverview'

// Demo stat values for testing
const DEMO_STATS: Record<string, StatBlockValue> = {
  nodes: { value: 42, sublabel: 'total nodes' },
  cpus: { value: 384, sublabel: 'cores allocatable' },
  memory: { value: '1.2 TB', sublabel: 'allocatable' },
  gpus: { value: 24, sublabel: 'total GPUs' },
  tpus: { value: 0, sublabel: 'total TPUs' },
  pods: { value: 1247, sublabel: 'running pods' },
  cpu_util: { value: '67%', sublabel: 'average' },
  memory_util: { value: '54%', sublabel: 'average' },
}

export function UnifiedStatsTest() {
  // Stat value getter - same for both components
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    return DEMO_STATS[blockId] || { value: '-', sublabel: '' }
  }, [])

  return (
    <div className="p-6 pt-20">
      <h1 className="text-2xl font-bold mb-6">UnifiedStatsSection Framework Test</h1>
      <div className="text-muted-foreground mb-8">
        Side-by-side comparison of UnifiedStatsSection (top) vs Legacy StatsOverview (bottom)
      </div>

      {/* UnifiedStatsSection rendering */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-purple-400">
          UnifiedStatsSection (from config)
        </h2>
        <div className="border border-purple-500/30 rounded-lg p-4 bg-card">
          <UnifiedStatsSection
            config={COMPUTE_STATS_CONFIG}
            getStatValue={getStatValue}
            hasData={true}
            isLoading={false}
          />
        </div>
      </div>

      {/* Legacy StatsOverview rendering */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-blue-400">
          Legacy StatsOverview (component)
        </h2>
        <div className="border border-blue-500/30 rounded-lg p-4 bg-card">
          <StatsOverview
            dashboardType="compute"
            getStatValue={getStatValue}
            hasData={true}
            isLoading={false}
          />
        </div>
      </div>

      {/* Diff analysis */}
      <div className="mt-8 p-4 bg-secondary/50 rounded-lg">
        <h3 className="font-semibold mb-3">Framework Comparison</h3>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>✅ <Trans i18nKey="testPages.unifiedStatsTest.featureSameGetStatValueInterface" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedStatsTest.featureSameStatBlocks" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedStatsTest.featureCollapsibleSections" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedStatsTest.featureConfigurationModal" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedStatsTest.featureDemoIndicator" components={{ strong: <strong /> }} /></li>
          <li>⚠️ <Trans i18nKey="testPages.unifiedStatsTest.gapConfigSource" components={{ strong: <strong /> }} /></li>
        </ul>
      </div>
    </div>
  )
}

export default UnifiedStatsTest
