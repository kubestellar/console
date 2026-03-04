/**
 * ContributorLeaderboard — shows top contributors ranked by coins, with search and detail panel.
 */

import { useState, useCallback } from 'react'
import {
  Trophy, Search, RefreshCw, ChevronDown, ChevronUp,
  GitPullRequest, CircleDot, Clock, MessageSquare, Calendar, FolderGit2,
  Medal,
} from 'lucide-react'
import { useLeaderboard, useContributorDetail } from '../../hooks/useLeaderboard'
import { CONTRIBUTOR_LEVELS } from '../../types/rewards'
import type { LeaderboardEntry } from '../../types/rewards'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { BACKEND_DEFAULT_URL } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import type { ContributorStats } from '../../types/rewards'

const SEARCH_DEBOUNCE_MS = 300
const HOURS_PER_DAY = 24
const RANK_GOLD = 1
const RANK_SILVER = 2
const RANK_BRONZE = 3

/** Returns Tailwind color class for a rank medal */
function getRankColor(rank: number): string {
  switch (rank) {
    case RANK_GOLD: return 'text-yellow-400'
    case RANK_SILVER: return 'text-gray-300'
    case RANK_BRONZE: return 'text-amber-600'
    default: return 'text-muted-foreground'
  }
}

/** Returns the level's Tailwind text class from CONTRIBUTOR_LEVELS */
function getLevelStyle(levelRank: number) {
  const level = CONTRIBUTOR_LEVELS.find(l => l.rank === levelRank)
  return {
    textClass: level?.textClass ?? 'text-gray-400',
    bgClass: level?.bgClass ?? 'bg-gray-500/20',
    borderClass: level?.borderClass ?? 'border-gray-500/30',
  }
}

/** Format hours as "2.4 days" or "18h" */
function formatPRTime(hours: number): string {
  if (hours <= 0) return '—'
  if (hours >= HOURS_PER_DAY) {
    const days = Math.round(hours / HOURS_PER_DAY * 10) / 10
    return `${days}d`
  }
  return `${Math.round(hours)}h`
}

/** Format a date string as "Mar 2024" */
function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function LeaderboardRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: LeaderboardEntry
  isSelected: boolean
  onClick: () => void
}) {
  const rankColor = getRankColor(entry.rank)
  const levelStyle = getLevelStyle(entry.level_rank)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary/40 transition-colors cursor-pointer ${
        isSelected ? 'bg-secondary/30' : ''
      }`}
    >
      {/* Rank */}
      <span className={`w-5 text-center text-xs font-bold ${rankColor}`}>
        {entry.rank <= RANK_BRONZE ? (
          <Medal className={`w-3.5 h-3.5 inline ${rankColor}`} />
        ) : (
          `#${entry.rank}`
        )}
      </span>

      {/* Avatar */}
      {entry.avatar_url ? (
        <img
          src={entry.avatar_url}
          alt={entry.login}
          className="w-5 h-5 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground flex-shrink-0">
          {entry.login.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Login */}
      <span className="text-xs text-foreground truncate flex-1">{entry.login}</span>

      {/* Coins */}
      <span className="text-xs text-yellow-400 font-medium tabular-nums">
        {entry.total_points.toLocaleString()}
      </span>

      {/* Level badge */}
      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${levelStyle.bgClass} ${levelStyle.textClass} ${levelStyle.borderClass}`}>
        {entry.level}
      </span>
    </button>
  )
}

function DetailPanel({ stats, isLoading }: { stats: ContributorStats | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="px-3 py-4 text-center">
        <RefreshCw className="w-4 h-4 mx-auto animate-spin text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground mt-1">Loading stats...</p>
      </div>
    )
  }

  if (!stats) return null

  const levelStyle = getLevelStyle(stats.level_rank)

  return (
    <div className="px-3 py-2.5 bg-purple-500/5 border-t border-purple-500/10">
      {/* Header: avatar + login + level + coins */}
      <div className="flex items-center gap-2 mb-2">
        {stats.avatar_url ? (
          <img src={stats.avatar_url} alt={stats.login} className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
            {stats.login.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{stats.login}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${levelStyle.bgClass} ${levelStyle.textClass} ${levelStyle.borderClass}`}>
              {stats.level}
            </span>
          </div>
          <span className="text-[10px] text-yellow-400">{stats.total_points.toLocaleString()} coins</span>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div className="text-center">
          <Clock className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
          <div className="text-[10px] font-medium text-foreground">{formatPRTime(stats.avg_pr_time_hours)}</div>
          <div className="text-[8px] text-muted-foreground">Avg PR Time</div>
        </div>
        <div className="text-center">
          <MessageSquare className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
          <div className="text-[10px] font-medium text-foreground">{stats.avg_pr_iterations || '—'}</div>
          <div className="text-[8px] text-muted-foreground">Avg Reviews</div>
        </div>
        <div className="text-center">
          <GitPullRequest className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
          <div className="text-[10px] font-medium text-foreground">{stats.total_prs}</div>
          <div className="text-[8px] text-muted-foreground">PRs</div>
        </div>
        <div className="text-center">
          <CircleDot className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
          <div className="text-[10px] font-medium text-foreground">{stats.total_issues}</div>
          <div className="text-[8px] text-muted-foreground">Issues</div>
        </div>
      </div>

      {/* Extra info row */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        {stats.first_contribution && (
          <span className="flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />
            Since {formatDate(stats.first_contribution)}
          </span>
        )}
        {stats.most_active_repo && (
          <span className="flex items-center gap-1 truncate">
            <FolderGit2 className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{stats.most_active_repo}</span>
          </span>
        )}
      </div>

      {/* Breakdown pills */}
      {stats.breakdown && (
        <div className="flex flex-wrap gap-1 mt-2">
          {stats.breakdown.prs_merged > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              {stats.breakdown.prs_merged} Merged
            </span>
          )}
          {stats.breakdown.prs_opened > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {stats.breakdown.prs_opened} PRs
            </span>
          )}
          {stats.breakdown.bug_issues > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              {stats.breakdown.bug_issues} Bugs
            </span>
          )}
          {stats.breakdown.feature_issues > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {stats.breakdown.feature_issues} Features
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function ContributorLeaderboard() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<ContributorStats | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [refreshAnimating, setRefreshAnimating] = useState(false)

  const { entries, isLoading, refresh } = useLeaderboard()
  const { stats: detailStats, isLoading: detailLoading } = useContributorDetail(selectedLogin)

  const handleRefresh = useCallback(async () => {
    setRefreshAnimating(true)
    await refresh()
    // Let animation complete one full turn
    setTimeout(() => setRefreshAnimating(false), SEARCH_DEBOUNCE_MS)
  }, [refresh])

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    // Check if the query matches a leaderboard entry
    const match = (entries || []).find(e => e.login.toLowerCase() === query.toLowerCase())
    if (match) {
      setSelectedLogin(match.login)
      setSearchResult(null)
      setSearchError(null)
      return
    }

    // Search for the user via the contributor detail API
    setSearchLoading(true)
    setSearchError(null)
    setSelectedLogin(null)
    try {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!token) throw new Error('Not authenticated')

      const apiBase = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL
      const res = await fetch(`${apiBase}/api/rewards/contributor/${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`Not found (${res.status})`)
      const result: ContributorStats = await res.json()
      if (result.total_points === 0) {
        setSearchError('No contributions found')
        setSearchResult(null)
      } else {
        setSearchResult(result)
        setSearchError(null)
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
      setSearchResult(null)
    } finally {
      setSearchLoading(false)
    }
  }, [searchQuery, entries])

  const handleRowClick = (login: string) => {
    if (selectedLogin === login) {
      setSelectedLogin(null)
    } else {
      setSelectedLogin(login)
      setSearchResult(null)
    }
  }

  return (
    <div className="border-b border-border/50">
      {/* Header */}
      <div className="px-2 py-1.5 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors"
        >
          <Trophy className="w-3 h-3 text-yellow-500" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Leaderboard
          </span>
          {isCollapsed ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowSearch(!showSearch)
              if (showSearch) {
                setSearchQuery('')
                setSearchResult(null)
                setSearchError(null)
              }
            }}
            className="p-1 hover:bg-secondary/50 rounded transition-colors cursor-pointer"
            title="Search contributor"
          >
            <Search className="w-3 h-3 text-muted-foreground" />
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 hover:bg-secondary/50 rounded transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh leaderboard"
          >
            <RefreshCw className={`w-3 h-3 text-muted-foreground ${refreshAnimating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content (collapsible) */}
      {!isCollapsed && (
        <>
          {/* Search bar */}
          {showSearch && (
            <div className="px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  placeholder="GitHub username..."
                  className="flex-1 text-xs bg-secondary/50 border border-border/50 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="text-[10px] px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {searchLoading ? '...' : 'Go'}
                </button>
              </div>
              {searchError && (
                <p className="text-[10px] text-red-400 mt-1 px-1">{searchError}</p>
              )}
            </div>
          )}

          {/* Search result detail */}
          {searchResult && (
            <DetailPanel stats={searchResult} isLoading={false} />
          )}

          {/* Leaderboard list */}
          {isLoading && (entries || []).length === 0 ? (
            <div className="px-3 py-4 text-center">
              <RefreshCw className="w-4 h-4 mx-auto animate-spin text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground mt-1">Loading leaderboard...</p>
            </div>
          ) : (entries || []).length === 0 ? (
            <div className="px-3 py-3 text-center">
              <Trophy className="w-5 h-5 mx-auto text-muted-foreground/50 mb-1" />
              <p className="text-[10px] text-muted-foreground">No contributors yet</p>
            </div>
          ) : (
            <div>
              {(entries || []).map(entry => (
                <div key={entry.login}>
                  <LeaderboardRow
                    entry={entry}
                    isSelected={selectedLogin === entry.login}
                    onClick={() => handleRowClick(entry.login)}
                  />
                  {selectedLogin === entry.login && !searchResult && (
                    <DetailPanel stats={detailStats} isLoading={detailLoading} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
