/**
 * TenantIsolationSetup — AI-powered multi-tenancy setup wizard.
 *
 * Shows component readiness, isolation levels, architecture description,
 * and CTA buttons to launch AI missions for configuration.
 */
import { useState } from 'react'
import {
  CheckCircle, XCircle, AlertTriangle, Shield, Wand2, Download,
  Network, Layers, Box, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMissions } from '../../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../console-missions/shared'
import { ConfirmMissionPromptDialog } from '../../../missions/ConfirmMissionPromptDialog'
import { useCardLoadingState } from '../../CardDataContext'
import { useTenantIsolationSetup } from './useTenantIsolationSetup'
import { DEMO_TENANT_ISOLATION_SETUP } from './demoData'
import {
  MULTI_TENANCY_SETUP_PROMPT,
  OVN_INSTALL_PROMPT,
  KUBEFLEX_INSTALL_PROMPT,
  K3S_INSTALL_PROMPT,
  KUBEVIRT_INSTALL_PROMPT } from './missionPrompts'
import { loadMissionPrompt } from '../missionLoader'

import { ISOLATION_STATUS_COLORS } from '../shared'
import type { ComponentReadiness, IsolationLevel, IsolationStatus } from './useTenantIsolationSetup'

/** Icon map for component keys */
const COMPONENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ovn: Network,
  kubeflex: Layers,
  k3s: Box,
  kubevirt: Monitor }

/** Install prompt map for per-component install buttons */
const INSTALL_PROMPTS: Record<string, string> = {
  ovn: OVN_INSTALL_PROMPT,
  kubeflex: KUBEFLEX_INSTALL_PROMPT,
  k3s: K3S_INSTALL_PROMPT,
  kubevirt: KUBEVIRT_INSTALL_PROMPT }

/** Status icon for isolation levels */
function IsolationStatusIcon({ status }: { status: IsolationStatus }) {
  switch (status) {
    case 'ready':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
    case 'degraded':
      return <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
    case 'missing':
      return <XCircle className="w-3.5 h-3.5 text-zinc-500" />
  }
}

/** Component readiness badge */
function ReadinessBadge({ component, onInstall }: {
  component: ComponentReadiness
  onInstall: (key: string) => void
}) {
  const IconComponent = COMPONENT_ICONS[component.key] || Shield

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary/40">
      <IconComponent className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-xs font-medium text-foreground flex-1">{component.name}</span>
      {component.detected ? (
        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <button
          onClick={() => onInstall(component.key)}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          title={`Install ${component.name}`}
        >
          <Download className="w-3 h-3" />
          Install
        </button>
      )}
    </div>
  )
}

/** Isolation level row */
function IsolationLevelRow({ level }: { level: IsolationLevel }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 py-1">
      <div className="flex items-center gap-1.5">
        <IsolationStatusIcon status={level.status} />
        <span className="text-xs text-foreground">{level.type}</span>
      </div>
      <span className={`text-xs capitalize ${ISOLATION_STATUS_COLORS[level.status]}`}>
        {level.status}
      </span>
    </div>
  )
}

export function TenantIsolationSetup() {
  const { t } = useTranslation(['cards'])
  const liveData = useTenantIsolationSetup()
  const { startMission } = useMissions()
  const {
    showKeyPrompt,
    checkKeyAndRun,
    goToSettings,
    dismissPrompt } = useApiKeyCheck()

  // #5913 — Holds a mission awaiting user review/edit of its prompt.
  const [pendingMission, setPendingMission] = useState<{
    title: string
    description: string
    prompt: string
  } | null>(null)

  // Use demo data when all hooks return demo data
  const data = liveData.isDemoData ? DEMO_TENANT_ISOLATION_SETUP : liveData

  const { showSkeleton } = useCardLoadingState({
    isLoading: data.isLoading && !data.isDemoData,
    isRefreshing: liveData.isRefreshing,
    hasAnyData: true,
    isDemoData: data.isDemoData })

  // Launch the combined multi-tenancy setup mission (loads from console-kb)
  const handleConfigureAll = () => {
    checkKeyAndRun(async () => {
      const prompt = await loadMissionPrompt('multi-tenancy', MULTI_TENANCY_SETUP_PROMPT)
      // #5913 — Let the user review/edit the prompt before running.
      setPendingMission({
        title: 'Configure Multi-Tenancy',
        description: 'Set up OVN, KubeFlex, K3s, and KubeVirt for tenant isolation',
        prompt,
      })
    })
  }

  // Launch per-component install mission (loads from console-kb)
  const handleInstallComponent = (key: string) => {
    const fallbackPrompt = INSTALL_PROMPTS[key]
    if (!fallbackPrompt) return

    const componentNames: Record<string, string> = {
      ovn: 'OVN-Kubernetes',
      kubeflex: 'KubeFlex',
      k3s: 'K3s',
      kubevirt: 'KubeVirt' }

    checkKeyAndRun(async () => {
      const prompt = await loadMissionPrompt(key, fallbackPrompt)
      // #5913 — Let the user review/edit the prompt before running.
      setPendingMission({
        title: `Install ${componentNames[key] || key}`,
        description: `Install and configure ${componentNames[key] || key} for multi-tenancy`,
        prompt,
      })
    })
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">
          {t('cards:multiTenancy.loadingSetup', 'Loading setup wizard...')}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3 relative">
      {/* AI Agent Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      {/* #5913 — Review/edit the AI mission prompt before running */}
      {pendingMission && (
        <ConfirmMissionPromptDialog
          open={!!pendingMission}
          missionTitle={pendingMission.title}
          missionDescription={pendingMission.description}
          initialPrompt={pendingMission.prompt}
          onCancel={() => setPendingMission(null)}
          onConfirm={(editedPrompt) => {
            const { title, description } = pendingMission
            setPendingMission(null)
            startMission({
              title,
              description,
              type: 'deploy',
              initialPrompt: editedPrompt,
            })
          }}
        />
      )}

      {/* Component readiness row */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5 font-medium">
          {t('cards:multiTenancy.componentReadiness', 'Component Readiness')} ({data.readyCount}/{data.totalComponents})
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
          {(data.components || []).map((component) => (
            <ReadinessBadge
              key={component.key}
              component={component}
              onInstall={handleInstallComponent}
            />
          ))}
        </div>
      </div>

      {/* Isolation levels */}
      <div className="flex-1">
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
          {/* Isolation level indicators */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">
              {t('cards:multiTenancy.isolationLevels', 'Isolation Levels')} ({data.isolationScore}/{data.totalIsolationLevels})
            </div>
            <div className="bg-secondary/20 rounded-lg px-3 py-2 space-y-0.5">
              {(data.isolationLevels || []).map((level) => (
                <IsolationLevelRow key={level.type} level={level} />
              ))}
            </div>
          </div>

          {/* Architecture description */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">
              {t('cards:multiTenancy.architecture', 'Architecture')}
            </div>
            <div className="bg-secondary/20 rounded-lg px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p>{t('cards:multiTenancy.archDesc1', 'KubeCon-presented architecture for full tenant isolation:')}</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>{t('cards:multiTenancy.archControl', 'Control-plane: KubeFlex + K3s dedicated clusters')}</li>
                <li>{t('cards:multiTenancy.archData', 'Data-plane: KubeVirt VMs as pods')}</li>
                <li>{t('cards:multiTenancy.archNetwork', 'Network: OVN-K8s UDN (L3 primary + L2 secondary)')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* CTA button */}
      <button
        onClick={handleConfigureAll}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
      >
        <Wand2 className="w-4 h-4" />
        {data.allReady
          ? t('cards:multiTenancy.verifyConfiguration', 'Verify Configuration')
          : t('cards:multiTenancy.configureMultiTenancy', 'Configure Multi-Tenancy')}
      </button>
    </div>
  )
}
