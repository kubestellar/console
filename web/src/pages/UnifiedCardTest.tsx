/**
 * UnifiedCard Test Page
 *
 * Compares UnifiedCard rendering vs legacy component rendering
 * to validate the unified framework works correctly.
 */

import { UnifiedCard } from '../lib/unified/card/UnifiedCard'
import { podIssuesConfig } from '../config/cards/pod-issues'
import { PodIssues } from '../components/cards/PodIssues'

export function UnifiedCardTest() {
  return (
    <div className="p-6 pt-20">
      <h1 className="text-2xl font-bold mb-6">UnifiedCard Framework Test</h1>
      <p className="text-muted-foreground mb-8">
        Side-by-side comparison of UnifiedCard (left) vs Legacy Component (right)
      </p>

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
        <h3 className="font-semibold mb-3">Framework Gaps to Fix (Phase 4)</h3>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>❌ <strong>Sorting</strong> - No sort controls (Sort: Status, Ascending buttons)</li>
          <li>❌ <strong>CardAIActions</strong> - Diagnose/Repair buttons not rendered on items</li>
          <li>❌ <strong>Header stats badge</strong> - Legacy shows "168 issues" count badge</li>
          <li>❌ <strong>Restart count format</strong> - Shows "6.3K" vs legacy "6260 restarts"</li>
          <li>❌ <strong>Multi-status display</strong> - Shows single status vs "CrashLoopBackOff, OOMKilled"</li>
          <li>❌ <strong>Row layout</strong> - Simpler layout vs legacy CardListItem with metadata</li>
        </ul>
        <h3 className="font-semibold mb-3 mt-4">Working Features</h3>
        <ul className="list-disc list-inside text-sm text-green-400 space-y-1">
          <li>✅ <strong>Hook registration</strong> - registerUnifiedHooks() called in main.tsx</li>
          <li>✅ <strong>Data fetching</strong> - useCachedPodIssues loads 168 issues</li>
          <li>✅ <strong>Pagination</strong> - Page navigation works correctly</li>
          <li>✅ <strong>Text search</strong> - Filters items as you type</li>
          <li>✅ <strong>Cluster filter</strong> - Dropdown filters by cluster</li>
          <li>✅ <strong>Renderers</strong> - cluster-badge, status-badge, number renderers work</li>
        </ul>
      </div>
    </div>
  )
}

export default UnifiedCardTest
