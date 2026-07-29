/**
 * MissionDetailView
 *
 * Formatted, human-readable mission viewer with tabbed sections:
 * Install | Uninstall | Update/Upgrade | Troubleshooting
 * Replaces raw JSON with structured, copy-pasteable content.
 *
 * Header actions live in `MissionDetailView.header.tsx`, metadata/links/
 * prerequisites in `MissionDetailView.meta.tsx`, and the tab strip plus tab
 * bodies in `MissionDetailView.tabs.tsx`.
 */

import { useState } from 'react'
import { Download, Trash2, ArrowUpCircle, Wrench, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type TabId, type TabDef, type MissionDetailViewProps } from './MissionDetailView.types'
import { MissionDetailHeader } from './MissionDetailView.header'
import { MissionDetailMeta } from './MissionDetailView.meta'
import { MissionDetailTabNav, MissionDetailTabContent } from './MissionDetailView.tabs'

export function MissionDetailView({
  mission,
  rawContent,
  showRaw,
  onToggleRaw,
  onImport,
  onBack,
  onImprove,
  matchScore,
  importLabel = 'Import',
  hideBackButton = false,
  shareUrl,
  loading = false,
  error = null,
  onRetry }: MissionDetailViewProps) {
  const { t } = useTranslation()

  const tabs: TabDef[] = [
    {
      id: 'install',
      label: t('missions.detail.tabs.install'),
      icon: Download,
      steps: mission.steps || [],
      emptyMessage: t('missions.detail.tabs.installEmpty'),
      color: 'bg-green-500/20 text-green-400' },
    {
      id: 'uninstall',
      label: t('missions.detail.tabs.uninstall'),
      icon: Trash2,
      steps: mission.uninstall || [],
      emptyMessage: t('missions.detail.tabs.uninstallEmpty'),
      color: 'bg-red-500/20 text-red-400' },
    {
      id: 'upgrade',
      label: t('missions.detail.tabs.upgrade'),
      icon: ArrowUpCircle,
      steps: mission.upgrade || [],
      emptyMessage: t('missions.detail.tabs.upgradeEmpty'),
      color: 'bg-blue-500/20 text-blue-400' },
    {
      id: 'troubleshooting',
      label: t('missions.detail.tabs.troubleshooting'),
      icon: Wrench,
      steps: mission.troubleshooting || [],
      emptyMessage: t('missions.detail.tabs.troubleshootingEmpty'),
      color: 'bg-yellow-500/20 text-yellow-400' },
    {
      id: 'security',
      label: t('missions.detail.tabs.security'),
      icon: Shield,
      steps: mission.security || [],
      emptyMessage: t('missions.detail.tabs.securityEmpty'),
      color: 'bg-purple-500/20 text-purple-400' },
  ]

  const [activeTab, setActiveTab] = useState<TabId>('install')
  const activeTabDef = tabs.find((tab) => tab.id === activeTab) ?? tabs?.[0]

  return (
    <div className="space-y-5">
      <MissionDetailHeader
        mission={mission}
        showRaw={showRaw}
        onToggleRaw={onToggleRaw}
        onImport={onImport}
        onBack={onBack}
        onImprove={onImprove}
        matchScore={matchScore}
        importLabel={importLabel}
        hideBackButton={hideBackButton}
        shareUrl={shareUrl}
      />

      {/* Raw view */}
      {showRaw && rawContent ? (
        <pre className="p-4 rounded-lg bg-secondary border border-border text-xs text-foreground font-mono overflow-x-auto max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
          {rawContent}
        </pre>
      ) : (
        <>
          <MissionDetailMeta mission={mission} error={error} onRetry={onRetry} />

          <MissionDetailTabNav tabs={tabs} activeTab={activeTab} onSelectTab={setActiveTab} />

          <MissionDetailTabContent
            mission={mission}
            activeTab={activeTab}
            activeTabDef={activeTabDef}
            loading={loading}
            onImprove={onImprove}
          />
        </>
      )}
    </div>
  )
}
