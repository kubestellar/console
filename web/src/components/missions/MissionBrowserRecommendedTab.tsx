/**
 * MissionBrowserRecommendedTab
 *
 * Content panel for the "Recommended" tab inside the Mission Browser.
 * Renders: token/rate-limit warning, fetch-error banner, cluster-matched
 * recommendations (with progressive loading), "Browse on GitHub" link, and
 * the directory listing for tree-navigation.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { Loader2, Sparkles, RefreshCw, ExternalLink } from 'lucide-react'
import { emitFixerGitHubLink } from '../../lib/analytics'
import { useTranslation } from 'react-i18next'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import {
  RecommendationCard,
  EmptyState,
  MissionFetchErrorBanner,
  VirtualizedMissionGrid,
  DirectoryListing,
  resetMissionCache,
} from './browser'
import type { TreeNode, ViewMode } from './browser'
import type { MissionMatch, MissionExport, BrowseEntry } from '../../lib/missions/types'

interface SearchProgress {
  step: string
  detail: string
  found: number
  scanned: number
}

interface MissionBrowserRecommendedTabProps {
  tokenError: 'rate_limited' | 'token_invalid' | null
  missionFetchError: string | null
  loadingRecommendations: boolean
  searchProgress: SearchProgress
  hasCluster: boolean
  recommendations: MissionMatch[]
  filteredRecommendations: MissionMatch[]
  onSelectMission: (mission: MissionExport) => void
  onImportMission: (mission: MissionExport) => void
  onCopyLink: (mission: MissionExport, e: React.MouseEvent) => void

  // Directory listing (tree navigation)
  loading: boolean
  filteredEntries: BrowseEntry[]
  selectedPath: string | null
  viewMode: ViewMode
  /** Called when the user imports a file from the directory listing (parent handles API fetch) */
  onImportDirectoryEntry: (entry: BrowseEntry) => void
  onToggleNode: (node: TreeNode) => void
  onSelectNode: (node: TreeNode) => void
}

export function MissionBrowserRecommendedTab({
  tokenError,
  missionFetchError,
  loadingRecommendations,
  searchProgress,
  hasCluster,
  recommendations,
  filteredRecommendations,
  onSelectMission,
  onImportMission,
  onCopyLink,
  loading,
  filteredEntries,
  selectedPath,
  viewMode,
  onImportDirectoryEntry,
  onToggleNode,
  onSelectNode,
}: MissionBrowserRecommendedTabProps) {
  const { t } = useTranslation(['common'])

  return (
    <>
      {/* Token / rate-limit guidance banner */}
      {tokenError && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
            <div className="text-sm space-y-2">
              <p className="font-medium text-yellow-300">
                {tokenError === 'rate_limited'
                  ? 'GitHub API rate limit reached'
                  : 'GitHub token is invalid or expired'}
              </p>
              <p className="text-muted-foreground">
                The fix browser needs a GitHub personal access token to fetch missions. Add one to
                your{' '}
                <code className="px-1.5 py-0.5 bg-white/10 rounded text-xs font-mono">.env</code>{' '}
                file and restart the console:
              </p>
              <ol className="text-muted-foreground list-decimal list-inside space-y-1.5 ml-1">
                <li>
                  <a
                    href="https://github.com/settings/tokens/new?description=KubeStellar+Console&scopes=public_repo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    Create a GitHub personal access token
                  </a>{' '}
                  (only{' '}
                  <code className="px-1 py-0.5 bg-white/10 rounded text-xs font-mono">
                    public_repo
                  </code>{' '}
                  scope needed)
                </li>
                <li>
                  Add it to your{' '}
                  <code className="px-1 py-0.5 bg-white/10 rounded text-xs font-mono">.env</code>{' '}
                  file:
                  <pre className="mt-1 px-3 py-2 bg-black/40 rounded text-xs font-mono text-purple-300 select-all">
                    GITHUB_TOKEN=ghp_your_token_here
                  </pre>
                </li>
                <li>{t('common.restartConsole')}</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Fetch error — only shown when there are no recommendations to display */}
      {missionFetchError && recommendations.length === 0 && !loadingRecommendations && (
        <div className="mb-4">
          <MissionFetchErrorBanner message={missionFetchError} />
        </div>
      )}

      {/* Recommended for You / Explore CNCF Fixes */}
      {(recommendations.length > 0 || loadingRecommendations) && (
        <CollapsibleSection
          title={hasCluster ? 'Recommended for Your Cluster' : 'Explore CNCF Fixes'}
          defaultOpen={true}
          badge={
            <span className="flex items-center gap-2 text-xs text-purple-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                {filteredRecommendations.length}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  resetMissionCache()
                }}
                className="p-0.5 rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh recommendations"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </span>
          }
          className="mb-6"
        >
          {/* Context subtitle */}
          {!loadingRecommendations && (
            <p className="text-xs text-muted-foreground mb-3 -mt-1">
              {hasCluster
                ? '🎯 Matched based on your cluster resources, labels, and detected issues'
                : '🌐 Showing popular CNCF community fixes — connect a cluster for personalized recommendations'}
            </p>
          )}

          {loadingRecommendations ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span className="flex-1">
                  {searchProgress.step === 'Connecting' && 'Connecting to knowledge base…'}
                  {searchProgress.step === 'Scanning' && (
                    <>
                      Scanning{' '}
                      <span className="text-purple-400 font-mono">{searchProgress.detail}</span>
                    </>
                  )}
                  {searchProgress.step === 'Error' && searchProgress.detail}
                </span>
                {searchProgress.found > 0 && (
                  <span className="text-xs text-purple-400 tabular-nums">
                    {searchProgress.found} found · {searchProgress.scanned} scanned
                  </span>
                )}
              </div>
              {/* Progressive cards while loading */}
              {filteredRecommendations.length > 0 && (
                <VirtualizedMissionGrid
                  items={filteredRecommendations}
                  viewMode="grid"
                  maxColumns={3}
                  className="flex-1 h-[calc(90vh-360px)]"
                  renderItem={(match) => (
                    <RecommendationCard
                      match={match}
                      onSelect={() => onSelectMission(match.mission)}
                      onImport={() => onImportMission(match.mission)}
                      onCopyLink={(e) => onCopyLink(match.mission, e)}
                    />
                  )}
                />
              )}
            </div>
          ) : (
            <VirtualizedMissionGrid
              items={filteredRecommendations}
              viewMode="grid"
              maxColumns={3}
              className="flex-1 h-[calc(90vh-360px)]"
              renderItem={(match) => (
                <RecommendationCard
                  match={match}
                  onSelect={() => onSelectMission(match.mission)}
                  onImport={() => onImportMission(match.mission)}
                />
              )}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Browse on GitHub link */}
      {!loading && (
        <div className="flex items-center gap-2 mb-4 px-1">
          <a
            href="https://github.com/kubestellar/console-kb/tree/master/fixes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-purple-400 transition-colors"
            onClick={() => emitFixerGitHubLink()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Browse all fixes on GitHub
          </a>
          {searchProgress.step === 'Done' && searchProgress.found > 0 && (
            <span className="text-xs text-muted-foreground/60 ml-auto">{searchProgress.detail}</span>
          )}
        </div>
      )}

      {/* Directory listing (tree-navigated folder contents) */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : filteredEntries.length > 0 ? (
        <DirectoryListing
          entries={filteredEntries}
          viewMode={viewMode}
          onSelect={(entry) => {
            const entrySource = selectedPath?.startsWith('github/') ? ('github' as const) : ('community' as const)
            const node: TreeNode = {
              id: entry.path,
              name: entry.name,
              path: entry.path,
              type: entry.type,
              source: entrySource,
              loaded: entry.type === 'file',
            }
            if (entry.type === 'file') {
              onSelectNode(node)
            } else {
              onToggleNode(node)
              onSelectNode(node)
            }
          }}
          onImport={onImportDirectoryEntry}
        />
      ) : selectedPath ? (
        <EmptyState message="No files in this directory" />
      ) : (
        <EmptyState message="Select a folder from the sidebar to browse missions" />
      )}
    </>
  )
}
