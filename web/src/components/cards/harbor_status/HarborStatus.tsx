import { useState } from 'react'
import { StatGrid } from '../../ui/StatGrid'
import { StatTile } from '../shared/StatTile'
import {
  CheckCircle,
  AlertTriangle,
  FolderOpen,
  Shield,
  Layers,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { Button } from '../../ui/Button'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useHarborStatus } from './useHarborStatus'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import {
  PROJECTS_TAB,
  REPOSITORIES_TAB,
  ProjectRow,
  RepositoryRow,
  type Tab,
} from './HarborStatus.parts'

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
    lastRefresh,
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
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="sm"
          showLabel={true}
        />
      </div>

      <StatGrid gap={3} className="mb-4 shrink-0 px-0.5">
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
      </StatGrid>

      <div
        className="flex gap-4 mb-3 border-b border-border/40 shrink-0 px-1"
        role="tablist"
        aria-label={t('harbor.tablistLabel', 'Harbor views')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            const nextTab = activeTab === PROJECTS_TAB ? REPOSITORIES_TAB : PROJECTS_TAB
            setActiveTab(nextTab)
            setSearchTerm('')
            const nextBtn = e.currentTarget.querySelector(`[data-tab="${nextTab}"]`) as HTMLElement | null
            nextBtn?.focus()
          }
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          role="tab"
          data-tab={PROJECTS_TAB}
          aria-selected={activeTab === PROJECTS_TAB}
          tabIndex={activeTab === PROJECTS_TAB ? 0 : -1}
          aria-label={t('harbor.projectsTabLabel', 'Projects ({{count}})', { count: totalProjects })}
          className={`relative whitespace-nowrap rounded-none px-0 pb-2 ${
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
        </Button>
        <Button
          variant="ghost"
          size="sm"
          role="tab"
          data-tab={REPOSITORIES_TAB}
          aria-selected={activeTab === REPOSITORIES_TAB}
          tabIndex={activeTab === REPOSITORIES_TAB ? 0 : -1}
          aria-label={t('harbor.repositoriesTabLabel', 'Repositories ({{count}})', { count: totalRepos })}
          className={`relative whitespace-nowrap rounded-none px-0 pb-2 ${
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
        </Button>

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
