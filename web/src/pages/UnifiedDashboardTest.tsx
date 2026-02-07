/**
 * UnifiedDashboard Test Page
 *
 * Tests the UnifiedDashboard component with the arcade dashboard config.
 * Compares it against the legacy Arcade component.
 */

import { UnifiedDashboard } from '../lib/unified/dashboard/UnifiedDashboard'
import { arcadeDashboardConfig } from '../config/dashboards/arcade'

export function UnifiedDashboardTest() {
  return (
    <div className="p-6 pt-20">
      <h1 className="text-2xl font-bold mb-6">UnifiedDashboard Framework Test</h1>
      <p className="text-muted-foreground mb-8">
        Testing UnifiedDashboard with arcade config ({arcadeDashboardConfig.cards.length} cards)
      </p>

      {/* UnifiedDashboard rendering */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-purple-400">
          UnifiedDashboard (from config)
        </h2>
        <div className="border border-purple-500/30 rounded-lg bg-card">
          <UnifiedDashboard config={arcadeDashboardConfig} />
        </div>
      </div>

      {/* Gap analysis */}
      <div className="p-4 bg-secondary/50 rounded-lg">
        <h3 className="font-semibold mb-3">UnifiedDashboard Features</h3>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>✅ <strong>Dashboard header</strong> - Title, subtitle, health indicator</li>
          <li>✅ <strong>Stats section</strong> - Uses UnifiedStatsSection (if configured)</li>
          <li>✅ <strong>Cards grid</strong> - Responsive 12-col layout</li>
          <li>✅ <strong>Drag-drop reordering</strong> - via dnd-kit</li>
          <li>✅ <strong>Card management</strong> - Remove, configure actions</li>
          <li>✅ <strong>localStorage persistence</strong> - Card order saved</li>
          <li>✅ <strong>Reset to defaults</strong> - When customized</li>
          <li>⚠️ <strong>Add card modal</strong> - TODO placeholder only</li>
          <li>⚠️ <strong>Configure card modal</strong> - TODO placeholder only</li>
        </ul>
      </div>
    </div>
  )
}

export default UnifiedDashboardTest
