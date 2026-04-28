import { useState } from 'react'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  FolderOpen,
  Database,
  Shield,
  Layers,
  Lock,
  Globe,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useHarborStatus } from './useHarborStatus'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
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
const PROJECTS_TAB = 'projects' as const
const REPOSITORIES_TAB = 'repositories' as const
type Tab = typeof PROJECTS_TAB | typeof REPOSITORIES_TAB

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
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400" title={t('harbor.vulnCritical', 'Critical format vulnerabilities')}>
          C:{vuln.critical}
        </span>
      )}
      {vuln.high > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/15 text-orange-400" title={t('harbor.vulnHigh', 'High format vulnerabilities')}>
          H:{vuln.high}
        </span>
      )}
      {vuln.medium > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/15 text-yellow-400" title={t('harbor.vulnMedium', 'Medium vulnerabilities')}>
          M:{vuln.medium}
        </span>
      )}
      {vuln.low > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400" title={t('harbor.vulnLow', 'Low vulnerabilities')}>
          L:{vuln.low}
        </span>
      )}
      {vuln.critical === 0 && vuln.high === 0 && vuln.medium === 0 && vuln.low === 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400">
          {t('harbor.vulnClean', 'Clean')}
        </span>
      )}
    </div>
  )
}

function ProjectRow({
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
          <span className="text-[10px] bg-secondary px-1.5 rounded-sm ml-1">
            {project.repoCount} {t('harbor.repositoriesLabel', 'repos')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <VulnBadges vuln={project.vulnerabilities} />
          <span className={`text-[10px] flex items-center gap-1 pt-0.5 ${cfg.color}`} title={cfg.label}>
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

function RepositoryRow({
  repo,
  onClick,
}: {
  repo: HarborRepository
  onClick?: () => void
}) {
  const { t } = useTranslation('cards')

  const parts = repo.name.split('/')
  const projectName = parts.length > 1 ? parts[0] : ''
  const repoName = parts.length > 1 ? parts.slice(1).join('/') : repo.name

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

      <div className="flex flex-wrap items-center justify-between gap-y-2 text-[11px] text-muted-foreground">
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HarborStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    error,
    showSkeleton,
    showEmptyState,
    isRefreshing,
  } = useHarborStatus()
  const { drillToAllStorage } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<Tab>(PROJECTS_TAB)
  const [searchTerm, setSearchTerm] = useState('')

  // ---------------------------------------------------------------------------
  // Conditionals
  // ---------------------------------------------------------------------------

  if (showSkeleton) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <div className="flex items-center gap-2 px-1 mb-2">
          <div className="w-20 h-6 rounded bg-muted animate-pulse" />
          <div className="w-24 h-6 rounded bg-muted animate-pulse" />
        </div>
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  if (error || (showEmptyState && data.health === 'not-installed')) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <FolderOpen className="w-10 h-10 mb-3 text-muted-foreground/30" />
        <h3 className="text-sm font-medium text-foreground">
          {error ? t('harbor.fetchError', 'Failed to fetch Harbor status') : t('harbor.notInstalled', 'Harbor not detected')}
        </h3>
        {!error && (
          <p className="mt-1 text-xs text-muted-foreground max-w-[250px]">
            {t('harbor.notInstalledHint', 'No Harbor registry pods found. Deploy Harbor to enable container image management.')}
          </p>
        )}
      </div>
    )
  }

  const currentData = data

  const handleDrilldown = (targetDetails?: Record<string, string>) => {
    // Navigate to a generic storage or registry context view
    drillToAllStorage('registry', targetDetails)
  }

  // ---------------------------------------------------------------------------
  // Processing
  // ---------------------------------------------------------------------------

  const filteredProjects = (currentData.projects || []).filter((p) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return p.name.toLowerCase().includes(term)
  })

  const filteredRepos = (currentData.repositories || []).filter((r) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return r.name.toLowerCase().includes(term)
  })

  // Aggregate stats
  const totalProjects = (currentData.projects || []).length
  const totalRepos = (currentData.repositories || []).length
  let totalCritical = 0
  let totalHigh = 0
  for (const p of currentData.projects || []) {
    totalCritical += p.vulnerabilities.critical
    totalHigh += p.vulnerabilities.high
  }
  const totalVulns = totalCritical + totalHigh

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {isRefreshing && <RefreshIndicator isRefreshing={isRefreshing} />}

      <div className="flex flex-wrap items-center justify-between mb-4 shrink-0 px-1 gap-2">
        <div className="flex items-center gap-2">
          {currentData.health === 'healthy' ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {t('harbor.healthy', 'Healthy')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {currentData.health === 'degraded' ? t('harbor.degraded', 'Degraded') : t('harbor.statusUnknown', 'Unknown')}
            </span>
          )}
          {currentData.instanceName && (
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {currentData.instanceName}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-3 mb-4 shrink-0 px-0.5">
        <StatTile
          icon={<FolderOpen className="w-4 h-4 text-blue-400" />}
          label={t('harbor.projects', 'Projects')}
          value={totalProjects}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<Layers className="w-4 h-4 text-purple-400" />}
          label={t('harbor.repositories', 'Repositories')}
          value={totalRepos}
          colorClass="text-purple-400"
          borderClass="border-purple-500/20"
        />
        <StatTile
          icon={<Shield className="w-4 h-4 text-cyan-400" />}
          label={t('harbor.scans', 'Scans')}
          value={filteredRepos.reduce((acc, r) => acc + r.vulnerabilities.scanned, 0)}
          colorClass="text-cyan-400"
          borderClass="border-cyan-500/20"
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
          label={t('harbor.vulnerabilities', 'Vulnerabilities')}
          value={totalVulns}
          colorClass="text-orange-400"
          borderClass="border-orange-500/20"
        />
      </div>

      <div className="flex gap-4 mb-3 border-b border-border/40 shrink-0 px-1">
        <button
          className={`pb-2 text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === PROJECTS_TAB ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
          }`}
          onClick={() => {
            setActiveTab(PROJECTS_TAB)
            setSearchTerm('')
          }}
        >
          {t('harbor.projectsTab', 'Projects')}
          <span className="ml-1.5 text-xs bg-secondary px-1.5 rounded-full text-muted-foreground">
            {totalProjects}
          </span>
          {activeTab === PROJECTS_TAB && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
          )}
        </button>
        <button
          className={`pb-2 text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === REPOSITORIES_TAB ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
          }`}
          onClick={() => {
            setActiveTab(REPOSITORIES_TAB)
            setSearchTerm('')
          }}
        >
          {t('harbor.repositoriesTab', 'Repositories')}
          <span className="ml-1.5 text-xs bg-secondary px-1.5 rounded-full text-muted-foreground">
            {totalRepos}
          </span>
          {activeTab === REPOSITORIES_TAB && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
          )}
        </button>

        <div className="ml-auto mb-1 flex items-center">
          <CardSearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={
              activeTab === PROJECTS_TAB
                ? t('harbor.searchProjectsPlaceholder', 'Search projects…')
                : t('harbor.searchReposPlaceholder', 'Search repositories…')
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 nice-scrollbar pr-1 -mr-1">
        <div className="flex flex-col gap-2 pb-2">
          {activeTab === PROJECTS_TAB ? (
            filteredProjects.length > 0 ? (
              filteredProjects.map((project, idx) => (
                <ProjectRow
                  key={`${project.name}-${idx}`}
                  project={project}
                  onClick={() => handleDrilldown({ projectName: project.name })}
                />
              ))
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {searchTerm
                  ? t('harbor.noSearchResults', 'No results match your search.')
                  : t('harbor.noProjects', 'No projects found')}
              </div>
            )
          ) : filteredRepos.length > 0 ? (
            filteredRepos.map((repo, idx) => (
              <RepositoryRow
                key={`${repo.name}-${idx}`}
                repo={repo}
                onClick={() => handleDrilldown({ repoName: repo.name })}
              />
            ))
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {searchTerm
                ? t('harbor.noSearchResults', 'No results match your search.')
                : t('harbor.noRepos', 'No repositories found')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
