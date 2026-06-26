import { AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MissionToolCheckResult } from '../../hooks/useMissionToolCheck'

const TOOL_INSTALL_LINKS: Record<string, string> = {
  kubectl: 'https://kubernetes.io/docs/tasks/tools/',
  helm: 'https://helm.sh/docs/intro/install/',
}

function formatToolList(tools: string[]): string {
  return (tools || []).join(', ')
}

export function MissionToolPrerequisiteNotice({
  status,
  missingTools,
  requiredTools,
  errorMessage,
  showNotice,
}: Pick<MissionToolCheckResult, 'status' | 'missingTools' | 'requiredTools' | 'errorMessage' | 'showNotice'>) {
  const { t } = useTranslation('common')

  if (!showNotice) return null

  if (status === 'checking') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
        <span>{t('missionToolCheck.checking', { defaultValue: 'Checking for required local tools…' })}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {t('missionToolCheck.errorTitle', { defaultValue: 'Unable to verify local tools' })}
          </p>
          <p>
            {errorMessage || t('missionToolCheck.errorDescription', { defaultValue: 'The console could not verify required local tools right now.' })}
          </p>
        </div>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {t('missionToolCheck.readyTitle', { defaultValue: 'Local tools ready' })}
          </p>
          <p>
            {t('missionToolCheck.readyDescription', {
              defaultValue: 'Required local tools detected: {{tools}}.',
              tools: formatToolList(requiredTools),
            })}
          </p>
        </div>
      </div>
    )
  }

  const toolsToShow = missingTools.length > 0 ? missingTools : requiredTools
  const toolList = formatToolList(toolsToShow)
  const isBlocking = status === 'blocked'

  return (
    <div className="space-y-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            {isBlocking
              ? t('missionToolCheck.blockedTitle', { defaultValue: 'Install local tools before running' })
              : t('missionToolCheck.warningTitle', { defaultValue: 'Local tools recommended' })}
          </p>
          <p>
            {isBlocking
              ? t('missionToolCheck.blockedDescription', {
                  defaultValue: 'This mission requires {{tools}} to be installed locally before it can run.',
                  tools: toolList,
                })
              : t('missionToolCheck.warningDescription', {
                  defaultValue: 'This AI-assisted flow can continue, but local execution steps may still require {{tools}}.',
                  tools: toolList,
                })}
          </p>
          {isBlocking && (
            <p className="text-yellow-300">
              {t('missionToolCheck.blockedHint', { defaultValue: 'Run Mission is disabled until the required tools are installed.' })}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 pl-6">
        {toolsToShow.map(tool => {
          const href = TOOL_INSTALL_LINKS[tool.toLowerCase()]
          if (!href) return null
          return (
            <a
              key={tool}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-yellow-300 hover:text-yellow-200 hover:underline"
            >
              {t('missionToolCheck.installTool', { defaultValue: 'Install {{tool}}', tool })}
              <ExternalLink className="h-3 w-3" />
            </a>
          )
        })}
      </div>
    </div>
  )
}
