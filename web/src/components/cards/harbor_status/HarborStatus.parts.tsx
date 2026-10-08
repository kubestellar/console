import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  FolderOpen,
  Database,
  Layers,
  Lock,
  Globe,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  HarborProject,
  HarborRepository,
  HarborProjectStatus,
  HarborVulnSummary,
} from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USAGE_FULL_PERCENT = 100
const USAGE_HIGH_THRESHOLD = 80
const USAGE_MED_THRESHOLD = 50
export const PROJECTS_TAB = 'projects' as const
export const REPOSITORIES_TAB = 'repositories' as const
export type Tab = typeof PROJECTS_TAB | typeof REPOSITORIES_TAB

// ---------------------------------------------------------------------------
// Status config factory functions (i18n-safe)
// ---------------------------------------------------------------------------

type CardT = ReturnType<typeof useTranslation<'cards'>>['t']

function getProjectStatusConfig(
  t: CardT,
): Record<HarborProjectStatus, { label: string; color: string; icon: React.ReactNode }> {
  return {
    healthy: {
      label: t('harbor.healthy', 'Healthy'),
      color: 'text-green-400',
      icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    },
    unhealthy: {
      label: t('harbor.statusUnhealthy', 'Unhealthy'),
      color: 'text-red-400',
      icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    },
    unknown: {
      label: t('harbor.statusUnknown', 'Unknown'),
      color: 'text-yellow-400',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
    },
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UsageBar({ percent }: { percent: number }) {
  const barColor =
    percent >= USAGE_HIGH_THRESHOLD
      ? 'bg-red-500'
      : percent >= USAGE_MED_THRESHOLD
        ? 'bg-yellow-500'
        : 'bg-green-500'

  return (
    <div className="mt-1.5">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className={`h-full transition-all rounded-full ${barColor}`}
          style={{ width: `${Math.min(percent, USAGE_FULL_PERCENT)}%` }}
          title={`${percent}% used`}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-xs text-muted-foreground tabular-nums">
        <span>{percent}% used</span>
      </div>
    </div>
  )
}

function VulnBadges({ vuln }: { vuln: HarborVulnSummary }) {
  const { t } = useTranslation('cards')
  return (
    <div className="flex flex-wrap gap-1">
      {vuln.critical > 0 && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400" title={t('harbor.vulnCritical', 'Critical format vulnerabilities')}>
          C:{vuln.critical}
        </span>
      )}
      {vuln.high > 0 && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400" title={t('harbor.vulnHigh', 'High format vulnerabilities')}>
          H:{vuln.high}
        </span>
      )}
      {vuln.medium > 0 && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-500/15 text-yellow-400" title={t('harbor.vulnMedium', 'Medium vulnerabilities')}>
          M:{vuln.medium}
        </span>
      )}
      {vuln.low > 0 && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400" title={t('harbor.vulnLow', 'Low vulnerabilities')}>
          L:{vuln.low}
        </span>
      )}
      {vuln.critical === 0 && vuln.high === 0 && vuln.medium === 0 && vuln.low === 0 && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400">
          {t('harbor.vulnClean', 'Clean')}
        </span>
      )}
    </div>
  )
}

export function ProjectRow({
  project,
  onClick,
}: {
  project: HarborProject
  onClick?: () => void
}) {
  const { t } = useTranslation('cards')
  const statusConfig = getProjectStatusConfig(t)
  const cfg = statusConfig[project.status]

  return (
    <div
      className={`rounded-md bg-muted/30 px-3 py-2 space-y-1.5 group ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {project.isPublic ? (
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{project.name}</span>
          <span className="text-xs bg-secondary px-1.5 rounded-sm ml-1">
            {project.repoCount} {t('harbor.repositoriesLabel', 'repos')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <VulnBadges vuln={project.vulnerabilities} />
          <span className={`text-xs flex items-center gap-1 pt-0.5 ${cfg.color}`} title={cfg.label}>
            {cfg.icon}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <Database className="w-3 h-3" />
          {project.storageUsed || '0'} / {project.storageQuota || '—'}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {project.pullCount.toLocaleString()} {t('harbor.pulls', 'pulls')}
        </span>
      </div>

      <UsageBar percent={project.storagePercent} />
    </div>
  )
}

export function RepositoryRow({
  repo,
  onClick,
}: {
  repo: HarborRepository
  onClick?: () => void
}) {
  const { t } = useTranslation('cards')

  const parts = (repo.name || '').split('/')
  const projectName = parts.length > 1 ? parts[0] : ''
  const repoName = parts.length > 1 ? (parts || []).slice(1).join('/') : repo.name

  return (
    <div
      className={`rounded-md bg-muted/30 px-3 py-2 space-y-2 group ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 text-xs">
          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {projectName && <span className="text-muted-foreground">{projectName}/</span>}
          <span className="font-medium text-foreground truncate">{repoName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <VulnBadges vuln={repo.vulnerabilities} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1" title={t('harbor.artifacts', 'Artifacts')}>
            <Layers className="w-3 h-3" /> {repo.artifactCount}
          </span>
          <span className="flex items-center gap-1" title={t('harbor.pulls', 'Pulls')}>
            {repo.pullCount.toLocaleString()} {t('harbor.pullsShort', 'pulls')}
          </span>
        </div>
        <span>
          {t('harbor.updatedJustNow', 'updated recently')}
        </span>
      </div>
    </div>
  )
}
