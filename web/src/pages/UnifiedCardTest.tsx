/**
 * UnifiedCard Test Page
 *
 * Compares UnifiedCard rendering vs legacy component rendering
 * to validate the unified framework works correctly.
 */

import { Trans } from 'react-i18next'
import { UnifiedCard } from '../lib/unified/card/UnifiedCard'
import { podIssuesConfig } from '../config/cards/pod-issues'
import { PodIssues } from '../components/cards/PodIssues'

export function UnifiedCardTest() {
  return (
    <div className="p-6 pt-20">
      <h1 className="text-2xl font-bold mb-6">UnifiedCard Framework Test</h1>
      <div className="text-muted-foreground mb-8">
        Side-by-side comparison of UnifiedCard (left) vs Legacy Component (right)
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* UnifiedCard rendering */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-purple-400">
            UnifiedCard (from config)
          </h2>
          <div className="border border-purple-500/30 rounded-lg p-4 bg-card min-h-[400px]">
            <UnifiedCard config={podIssuesConfig} />
          </div>
        </div>

        {/* Legacy component rendering */}
        <div>
          <h2 className="text-lg font-semibold mb-3 text-blue-400">
            Legacy PodIssues (component)
          </h2>
          <div className="border border-blue-500/30 rounded-lg p-4 bg-card min-h-[400px]">
            <PodIssues />
          </div>
        </div>
      </div>

      {/* Diff analysis */}
      <div className="mt-8 p-4 bg-secondary/50 rounded-lg">
        <h3 className="font-semibold mb-3">Remaining Minor Gaps</h3>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>⚠️ <Trans i18nKey="testPages.unifiedCardTest.gapHeaderStatsBadge" components={{ strong: <strong /> }} /></li>
          <li>⚠️ <Trans i18nKey="testPages.unifiedCardTest.gapRestartCountFormat" components={{ strong: <strong /> }} /></li>
          <li>⚠️ <Trans i18nKey="testPages.unifiedCardTest.gapMultiStatusDisplay" components={{ strong: <strong /> }} /></li>
          <li>⚠️ <Trans i18nKey="testPages.unifiedCardTest.gapRowLayout" components={{ strong: <strong /> }} /></li>
        </ul>
        <h3 className="font-semibold mb-3 mt-4">Working Features (Phase 4 Complete)</h3>
        <ul className="list-disc list-inside text-sm text-green-400 space-y-1">
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureHookRegistration" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureDataFetching" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featurePagination" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureTextSearch" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureClusterFilter" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureRenderers" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureCardAIActions" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureSorting" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureCustomVisualization" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureDashboardAddCard" components={{ strong: <strong /> }} /></li>
          <li>✅ <Trans i18nKey="testPages.unifiedCardTest.featureDashboardConfigureCard" components={{ strong: <strong /> }} /></li>
        </ul>
      </div>
    </div>
  )
}

export default UnifiedCardTest
