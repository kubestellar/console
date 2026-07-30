import { useState, useEffect } from 'react'
import { GraduationCap, ChevronDown, ChevronUp, HandHelping, ExternalLink } from 'lucide-react'
import type { CNCFStats } from '../../hooks/useMarketplace'

const BANNER_COLLAPSED_KEY = 'kc-cncf-banner-collapsed'
const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'
const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'

export function CNCFProgressBanner({ stats }: { stats: CNCFStats }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(BANNER_COLLAPSED_KEY) === 'true' } catch { return false }
  })

  // Sync banner collapsed state across tabs (fix #6006).
  // The `storage` event only fires in OTHER tabs when localStorage changes,
  // so toggling in tab A will update tab B automatically.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== BANNER_COLLAPSED_KEY) return
      // If the key was removed, e.newValue is null — default to not collapsed.
      setCollapsed(e.newValue === 'true')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(BANNER_COLLAPSED_KEY, String(next)) } catch { /* ok */ }
  }

  if (stats.total === 0) return null

  const pct = Math.round((stats.completed / stats.total) * 100)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-900 to-cyan-900 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-foreground">CNCF Project Coverage</span>
            <span className="text-xs text-muted-foreground ml-2">
              {stats.completed} of {stats.total} cards implemented
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">
          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-green-500 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {stats.graduatedTotal} Graduated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {stats.incubatingTotal} Incubating
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              {stats.helpWanted} Help Wanted
            </span>
          </div>

          {/* Action links */}
          <div className="flex items-center gap-2">
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
            >
              <HandHelping className="w-3 h-3" />
              Browse Issues
            </a>
            <a
              href={CONTRIBUTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Contributor Guide
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
