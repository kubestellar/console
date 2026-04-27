import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CARD_INSTALL_MAP } from '../../../lib/cards/cardInstallMap'
import { loadMissionPrompt } from '../multi-tenancy/missionLoader'
import { ClusterSelectionDialog } from '../../missions/ClusterSelectionDialog'
import { ConfirmMissionPromptDialog } from '../../missions/ConfirmMissionPromptDialog'
import { useMissions } from '../../../hooks/useMissions'
import { useLocalAgent } from '../../../hooks/useLocalAgent'

/** Timeout for fetching KB guide data (ms) */
const KB_FETCH_TIMEOUT_MS = 10_000

export interface InstallCTAFlowProps {
  cardType: string
  title: string
}

/**
 * Demo data install CTA button and its associated dialog chain:
 * 1. "Install for live data" button
 * 2. ClusterSelectionDialog (when agent connected)
 * 3. ConfirmMissionPromptDialog (review/edit prompt)
 * 4. Manual install guide modal (when agent not connected)
 */
export function InstallCTAFlow({ cardType, title }: InstallCTAFlowProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { startMission, openSidebar } = useMissions()
  const { status: agentStatus } = useLocalAgent()
  const isAgentConnected = agentStatus === 'connected'

  const installInfo = CARD_INSTALL_MAP[cardType]

  const [showClusterSelect, setShowClusterSelect] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState<{
    mission: { mission?: { title?: string; description?: string; steps?: { title?: string; description?: string }[] } }
  } | null>(null)
  const [pendingMission, setPendingMission] = useState<{
    prompt: string
    clusters: string[]
  } | null>(null)

  const handleClick = async () => {
    if (isAgentConnected && installInfo) {
      setShowClusterSelect(true)
    } else if (installInfo) {
      try {
        const resp = await fetch(`/console-kb/${installInfo.kbPaths[0]}`, { signal: AbortSignal.timeout(KB_FETCH_TIMEOUT_MS) })
        if (resp.ok) {
          const data = await resp.json()
          setShowInstallGuide({ mission: data })
        }
      } catch { /* ignore fetch error */ }
    } else {
      startMission({
        title: `Set up ${title} for live data`,
        description: `Install and configure the components needed for live data`,
        type: 'deploy',
        initialPrompt: `The user is viewing the "${title}" dashboard card which is currently showing demo data. Help them install and configure whatever is needed to get live data for this card.`,
      })
      openSidebar()
    }
  }

  return (
    <>
      {/* Install CTA button */}
      <div className="mt-auto pt-2 border-t border-yellow-500/10">
        <button
          onClick={(e) => { e.stopPropagation(); handleClick() }}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-yellow-400/80 hover:text-yellow-300 hover:bg-yellow-500/10 rounded transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          <span>Install {installInfo?.project ?? 'components'} for live data</span>
        </button>
      </div>

      {/* Cluster selection dialog (agent available) */}
      {showClusterSelect && installInfo && (
        <ClusterSelectionDialog
          open={showClusterSelect}
          onCancel={() => setShowClusterSelect(false)}
          onSelect={async (clusters) => {
            setShowClusterSelect(false)
            const prompt = await loadMissionPrompt(
              installInfo.missionKey,
              `Install and configure ${installInfo.project} for live data on the "${title}" dashboard card.`,
              installInfo.kbPaths,
            )
            const clusterContext = clusters.length > 0
              ? `\n\n**Target cluster(s):** ${clusters.join(', ')}\n\nPlease install on ${clusters.length === 1 ? `cluster "${clusters[0]}"` : `the following clusters: ${clusters.join(', ')}`}.`
              : ''
            setPendingMission({ prompt: prompt + clusterContext, clusters })
          }}
          missionTitle={`Install ${installInfo.project}`}
        />
      )}

      {/* Confirm/edit AI mission prompt (#5913) */}
      {pendingMission && installInfo && (
        <ConfirmMissionPromptDialog
          open={!!pendingMission}
          missionTitle={`Install ${installInfo.project}`}
          missionDescription={`Install and configure ${installInfo.project}`}
          initialPrompt={pendingMission.prompt}
          onCancel={() => setPendingMission(null)}
          onConfirm={(editedPrompt) => {
            const { clusters } = pendingMission
            setPendingMission(null)
            startMission({
              title: `Install ${installInfo.project}`,
              description: `Install and configure ${installInfo.project}`,
              type: 'deploy',
              cluster: clusters.length > 0 ? clusters.join(',') : undefined,
              initialPrompt: editedPrompt,
              skipReview: true,
            })
            openSidebar()
          }}
        />
      )}

      {/* Manual install guide modal (no agent) */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs" role="presentation" onClick={() => setShowInstallGuide(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <h3 id="install-guide-title" className="text-lg font-semibold">{showInstallGuide.mission.mission?.title ?? `Install ${installInfo?.project ?? 'Component'}`}</h3>
              <button onClick={() => setShowInstallGuide(null)} className="p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-secondary rounded" aria-label={t('common:actions.close')}><X className="w-4 h-4" /></button>
            </div>
            {showInstallGuide.mission.mission?.description && (
              <p className="text-sm text-muted-foreground mb-4">{showInstallGuide.mission.mission.description}</p>
            )}
            <ol className="space-y-4">
              {(showInstallGuide.mission.mission?.steps ?? []).map((step: { title?: string; description?: string }, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    {step.title && <p className="text-sm font-medium mb-1">{step.title}</p>}
                    {step.description && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{step.description}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
