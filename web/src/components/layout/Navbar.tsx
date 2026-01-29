import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, Server, Box, Activity, Command, Sun, Moon, Monitor, Coins, Globe, Filter, Check, AlertTriangle, Plus, Folder, X, Trash2, Wifi, WifiOff, Users, Download } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useGlobalFilters, SEVERITY_LEVELS, SEVERITY_CONFIG, STATUS_LEVELS, STATUS_CONFIG } from '../../hooks/useGlobalFilters'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { languages } from '../../lib/i18n'
import { TourTrigger } from '../onboarding/Tour'
import { UserProfileDropdown } from './UserProfileDropdown'
import { AlertBadge } from '../ui/AlertBadge'
import { FeatureRequestButton, FeedbackModal } from '../feedback'
import { AgentSelector } from '../agent/AgentSelector'
import { cn } from '../../lib/cn'

interface SearchResult {
  type: 'cluster' | 'app' | 'pod' | 'page'
  name: string
  description?: string
  href: string
  icon: typeof Server
}

// Demo search results - in production these would come from the API
const searchableItems: SearchResult[] = [
  { type: 'page', name: 'Dashboard', description: 'Main dashboard', href: '/', icon: Command },
  { type: 'page', name: 'Clusters', description: 'Manage clusters', href: '/clusters', icon: Server },
  { type: 'page', name: 'Workloads', description: 'View workloads', href: '/workloads', icon: Box },
  { type: 'page', name: 'Events', description: 'Cluster events', href: '/events', icon: Activity },
  { type: 'page', name: 'Security', description: 'RBAC & policies', href: '/security', icon: Command },
  { type: 'page', name: 'GitOps', description: 'Drift detection', href: '/gitops', icon: Command },
  { type: 'page', name: 'Settings', description: 'Console settings', href: '/settings', icon: Command },
  { type: 'cluster', name: 'kind-local', description: 'Local development cluster', href: '/clusters?name=kind-local', icon: Server },
  { type: 'cluster', name: 'vllm-d', description: 'Production GPU cluster', href: '/clusters?name=vllm-d', icon: Server },
  { type: 'app', name: 'nginx-ingress', description: 'Ingress controller', href: '/workloads?name=nginx-ingress', icon: Box },
  { type: 'app', name: 'prometheus', description: 'Monitoring stack', href: '/workloads?name=prometheus', icon: Box },
]

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { usage, alertLevel, percentage, remaining } = useTokenUsage()
  const { status: agentStatus, health: agentHealth, connectionEvents, isConnected, isDegraded, dataErrorCount, lastDataError } = useLocalAgent()
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const { activeUsers, showBadge: showActiveUsersBadge } = useActiveUsers()
  const {
    selectedClusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    isAllClustersSelected,
    availableClusters,
    clusterInfoMap,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    selectedSeverities,
    toggleSeverity,
    selectAllSeverities,
    deselectAllSeverities,
    isAllSeveritiesSelected,
    selectedStatuses,
    toggleStatus,
    selectAllStatuses,
    deselectAllStatuses,
    isAllStatusesSelected,
    customFilter,
    setCustomFilter,
    clearCustomFilter,
    hasCustomFilter,
    isFiltered,
  } = useGlobalFilters()

  // Helper to get cluster status tooltip
  const getClusterStatusTooltip = (clusterName: string) => {
    const info = clusterInfoMap[clusterName]
    if (!info) return 'Unknown status'
    if (info.healthy) return `Healthy - ${info.nodeCount || 0} nodes, ${info.podCount || 0} pods`
    if (info.errorMessage) return `Error: ${info.errorMessage}`
    if (info.errorType) {
      const errorMessages: Record<string, string> = {
        timeout: 'Connection timed out - cluster may be offline',
        auth: 'Authentication failed - check credentials',
        network: 'Network error - unable to reach cluster',
        certificate: 'Certificate error - check TLS configuration',
        unknown: 'Unknown error - check cluster status',
      }
      return errorMessages[info.errorType] || 'Cluster unavailable'
    }
    return 'Cluster unavailable'
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showTokenDetails, setShowTokenDetails] = useState(false)
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [showUpdateDropdown, setShowUpdateDropdown] = useState(false)
  const [tokenAnimating, setTokenAnimating] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const previousTokensRef = useRef<number>(usage.used)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLDivElement>(null)
  const languageRef = useRef<HTMLDivElement>(null)
  const clusterRef = useRef<HTMLDivElement>(null)
  const agentRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<HTMLDivElement>(null)
  const { hasUpdate, latestRelease, skipVersion, checkForUpdates } = useVersionCheck()

  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0]

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode)
    setShowLanguageMenu(false)
  }

  // Filter results based on query
  const searchResults = searchQuery.trim()
    ? searchableItems.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Animate token icon when usage increases significantly
  useEffect(() => {
    const increase = usage.used - previousTokensRef.current
    // Trigger animation if tokens increased by more than 100 (lowered for better visibility)
    if (increase > 100) {
      setTokenAnimating(true)
      const timer = setTimeout(() => setTokenAnimating(false), 2000)
      return () => clearTimeout(timer)
    }
    previousTokensRef.current = usage.used
  }, [usage.used])

  // Check for updates on mount (respects rate limiting)
  useEffect(() => {
    checkForUpdates()
  }, [checkForUpdates])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
      if (tokenRef.current && !tokenRef.current.contains(event.target as Node)) {
        setShowTokenDetails(false)
      }
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false)
      }
      if (clusterRef.current && !clusterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
      if (agentRef.current && !agentRef.current.contains(event.target as Node)) {
        setShowAgentStatus(false)
      }
      if (updateRef.current && !updateRef.current.contains(event.target as Node)) {
        setShowUpdateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Open search with Cmd+K
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setIsSearchOpen(true)
      }

      if (!isSearchOpen) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (event.key === 'Enter' && searchResults[selectedIndex]) {
        event.preventDefault()
        handleSelect(searchResults[selectedIndex])
      } else if (event.key === 'Escape') {
        setIsSearchOpen(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen, searchResults, selectedIndex])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  const handleSelect = (result: SearchResult) => {
    navigate(result.href)
    setSearchQuery('')
    setIsSearchOpen(false)
  }

  return (
    <nav data-tour="navbar" className="fixed top-0 left-0 right-0 h-16 glass z-50 px-6 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <img
          src="/kubestellar-logo.svg"
          alt="KubeStellar"
          className="w-9 h-9"
        />
        <span className="text-lg font-semibold text-foreground">KubeStellar Console</span>
      </div>

      {/* Search */}
      <div data-tour="search" className="flex-1 max-w-md mx-8" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            id="global-search"
            name="global-search"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsSearchOpen(true)
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="Search clusters, apps, pods..."
            className="w-full pl-10 pr-16 py-2 bg-secondary/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground bg-secondary rounded">
            <Command className="w-3 h-3" />K
          </kbd>

          {/* Search results dropdown */}
          {isSearchOpen && searchQuery && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
              {searchResults.length > 0 ? (
                <div className="py-2 max-h-80 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={`${result.type}-${result.name}`}
                      onClick={() => handleSelect(result)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                        index === selectedIndex
                          ? 'bg-purple-500/20 text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }`}
                    >
                      <result.icon className="w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{result.name}</p>
                        {result.description && (
                          <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                        )}
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                        {result.type}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-muted-foreground text-sm">No results for "{searchQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Clear Filters Button - shows when filters active */}
        {isFiltered && (
          <button
            onClick={() => {
              selectAllClusters()
              selectAllSeverities()
              selectAllStatuses()
              clearCustomFilter()
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-xs font-medium"
            title={t('common:filters.clearAll', 'Clear all filters')}
          >
            <X className="w-3 h-3" />
            <span className="hidden sm:inline">{t('common:filters.clear', 'Clear')}</span>
          </button>
        )}

        {/* Global Filters */}
        <div className="relative" ref={clusterRef}>
          <button
            onClick={() => setShowClusterFilter(!showClusterFilter)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
              isFiltered
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
            title={isFiltered ? 'Filters active - click to modify' : 'No filters - click to filter'}
          >
            <Filter className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">
              {isFiltered ? t('common:filters.active', 'Filtered') : t('common:filters.all', 'All')}
            </span>
            {isFiltered && (
              <span className="w-2 h-2 bg-purple-400 rounded-full" />
            )}
          </button>

          {/* Filter dropdown */}
          {showClusterFilter && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 max-h-[80vh] overflow-y-auto">
              {/* Custom Text Filter */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-foreground">{t('common:filters.customFilter', 'Custom Filter')}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customFilter}
                    onChange={(e) => setCustomFilter(e.target.value)}
                    placeholder={t('common:filters.customFilterPlaceholder', 'Filter by name, namespace...')}
                    className="flex-1 px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  {hasCustomFilter && (
                    <button
                      onClick={clearCustomFilter}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Severity Filter Section */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-foreground">{t('common:filters.severity', 'Severity')}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllSeverities}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      All
                    </button>
                    <button
                      onClick={deselectAllSeverities}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITY_LEVELS.map((severity) => {
                    const config = SEVERITY_CONFIG[severity]
                    const isSelected = isAllSeveritiesSelected || selectedSeverities.includes(severity)
                    return (
                      <button
                        key={severity}
                        onClick={() => toggleSeverity(severity)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                          isSelected
                            ? `${config.bgColor} ${config.color}`
                            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Status Filter Section */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-foreground">{t('common:filters.status', 'Status')}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllStatuses}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      All
                    </button>
                    <button
                      onClick={deselectAllStatuses}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_LEVELS.map((status) => {
                    const config = STATUS_CONFIG[status]
                    const isSelected = isAllStatusesSelected || selectedStatuses.includes(status)
                    return (
                      <button
                        key={status}
                        onClick={() => toggleStatus(status)}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                          isSelected
                            ? `${config.bgColor} ${config.color}`
                            : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {config.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cluster Groups Section */}
              {clusterGroups.length > 0 && (
                <div className="p-3 border-b border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Folder className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-foreground">{t('common:filters.clusterGroups', 'Cluster Groups')}</span>
                  </div>
                  <div className="space-y-1">
                    {clusterGroups.map((group) => (
                      <div key={group.id} className="flex items-center gap-2">
                        <button
                          onClick={() => selectClusterGroup(group.id)}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
                        >
                          <Folder className="w-3 h-3" />
                          <span className="truncate">{group.name}</span>
                          <span className="text-xs text-muted-foreground">({group.clusters.length})</span>
                        </button>
                        <button
                          onClick={() => deleteClusterGroup(group.id)}
                          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cluster Filter Section */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-foreground">{t('common:filters.clusters', 'Clusters')}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllClusters}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      All
                    </button>
                    <button
                      onClick={deselectAllClusters}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableClusters.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {t('common:filters.noClusters', 'No clusters available')}
                    </p>
                  ) : (
                    availableClusters.map((cluster) => {
                      const isSelected = isAllClustersSelected || selectedClusters.includes(cluster)
                      const info = clusterInfoMap[cluster]
                      // Only show healthy if explicitly true, otherwise check other conditions
                      const isHealthy = info?.healthy === true
                      const statusTooltip = getClusterStatusTooltip(cluster)
                      // Determine if cluster is unreachable vs unhealthy
                      const isUnreachable = info
                        ? (info.reachable === false ||
                           (!info.nodeCount || info.nodeCount === 0) ||
                           (info.errorType && ['timeout', 'network', 'certificate'].includes(info.errorType)))
                        : false
                      // Check if health status is still loading (no info yet)
                      const isLoading = !info || (info.nodeCount === undefined && info.reachable === undefined)
                      return (
                        <button
                          key={cluster}
                          onClick={() => toggleCluster(cluster)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors',
                            isSelected
                              ? 'bg-purple-500/20 text-foreground'
                              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                          )}
                          title={statusTooltip}
                        >
                          <div className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                            isSelected
                              ? 'bg-purple-500 border-purple-500'
                              : 'border-muted-foreground'
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          {/* Status indicator - loading spinner, yellow wifi for unreachable, orange alert for unhealthy, green check for healthy */}
                          {isLoading ? (
                            <div className="w-3 h-3 border border-muted-foreground/50 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          ) : isUnreachable ? (
                            <WifiOff className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                          ) : isHealthy ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                          )}
                          <span className={cn('text-sm truncate', isUnreachable ? 'text-yellow-400' : !isHealthy && !isLoading && 'text-orange-400')}>{cluster}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Create Cluster Group */}
              <div className="p-3">
                {showGroupForm ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Group name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-secondary/50 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <div className="text-xs text-muted-foreground mb-1">Select clusters for group:</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {availableClusters.map((cluster) => {
                        const isInGroup = newGroupClusters.includes(cluster)
                        return (
                          <button
                            key={cluster}
                            onClick={() => {
                              if (isInGroup) {
                                setNewGroupClusters(prev => prev.filter(c => c !== cluster))
                              } else {
                                setNewGroupClusters(prev => [...prev, cluster])
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors',
                              isInGroup
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'text-muted-foreground hover:bg-secondary/50'
                            )}
                          >
                            <div className={cn(
                              'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0',
                              isInGroup ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground'
                            )}>
                              {isInGroup && <Check className="w-2 h-2 text-white" />}
                            </div>
                            <span className="truncate">{cluster}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => {
                          if (newGroupName && newGroupClusters.length > 0) {
                            addClusterGroup({ name: newGroupName, clusters: newGroupClusters })
                            setNewGroupName('')
                            setNewGroupClusters([])
                            setShowGroupForm(false)
                          }
                        }}
                        disabled={!newGroupName || newGroupClusters.length === 0}
                        className="flex-1 px-2 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowGroupForm(false)
                          setNewGroupName('')
                          setNewGroupClusters([])
                        }}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGroupForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t('common:filters.createGroup', 'Create Cluster Group')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Update Indicator */}
        {hasUpdate && latestRelease && (
          <div className="relative" ref={updateRef}>
            <button
              onClick={() => setShowUpdateDropdown(!showUpdateDropdown)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
              title={`Update available: ${latestRelease.tag}`}
            >
              <Download className="w-4 h-4" />
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </button>

            {showUpdateDropdown && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-foreground">Update Available</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {latestRelease.tag}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigate('/settings')
                        setShowUpdateDropdown(false)
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => {
                        skipVersion(latestRelease.tag)
                        setShowUpdateDropdown(false)
                      }}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Agent Status Indicator */}
        <div className="relative" ref={agentRef}>
          <button
            onClick={() => setShowAgentStatus(!showAgentStatus)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
              isDemoMode
                ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                : isDegraded
                ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                : isConnected
                ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                : agentStatus === 'connecting'
                ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            )}
            title={isDemoMode ? 'Demo Mode - showing sample data' : isDegraded ? `Local Agent degraded (${dataErrorCount} errors)` : isConnected ? 'Local Agent connected' : agentStatus === 'connecting' ? 'Connecting to agent...' : 'Local Agent disconnected'}
          >
            {isDemoMode ? (
              <Box className="w-4 h-4" />
            ) : isConnected ? (
              <Wifi className="w-4 h-4" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            {isDemoMode && (
              <span className="text-xs font-medium hidden sm:inline">Demo</span>
            )}
            <span className={cn(
              'w-2 h-2 rounded-full',
              isDemoMode ? 'bg-purple-400' : isDegraded ? 'bg-yellow-400 animate-pulse' : isConnected ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
            )} />
          </button>

          {/* Agent status dropdown */}
          {showAgentStatus && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50">
              {/* Demo Mode Toggle */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-foreground">Demo Mode</span>
                  </div>
                  <button
                    onClick={toggleDemoMode}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      isDemoMode ? 'bg-purple-500' : 'bg-secondary'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
                        isDemoMode ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isDemoMode
                    ? 'Showing sample data with all cloud providers'
                    : 'Enable to view demo data without agent connection'
                  }
                </p>
              </div>

              {/* Agent Status */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-3 h-3 rounded-full',
                    isDemoMode ? 'bg-gray-400' : isDegraded ? 'bg-yellow-400' : isConnected ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
                  )} />
                  <span className={cn('text-sm font-medium', isDemoMode ? 'text-muted-foreground' : 'text-foreground')}>
                    Local Agent: {isDemoMode ? 'Bypassed' : isDegraded ? 'Degraded' : isConnected ? 'Connected' : agentStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                  </span>
                  {!isDemoMode && isConnected && agentHealth?.version && agentHealth.version !== 'demo' && (
                    <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                      v{agentHealth.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isDemoMode
                    ? 'Agent connection bypassed in demo mode'
                    : isDegraded
                    ? `Connected but experiencing data errors (${dataErrorCount} in last minute)`
                    : isConnected
                    ? `Connected to local agent at 127.0.0.1:8585`
                    : 'Unable to connect to local agent'
                  }
                </p>
                {!isDemoMode && isDegraded && lastDataError && (
                  <p className="text-xs text-yellow-400 mt-1">
                    Last error: {lastDataError}
                  </p>
                )}
              </div>

              <div className="p-2 max-h-48 overflow-y-auto">
                <div className="text-xs text-muted-foreground px-2 py-1 font-medium">Connection Log</div>
                {connectionEvents.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">No events yet</div>
                ) : (
                  <div className="space-y-1">
                    {connectionEvents.slice(0, 20).map((event, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/30"
                      >
                        <div className={cn(
                          'w-2 h-2 rounded-full mt-1 flex-shrink-0',
                          event.type === 'connected' ? 'bg-green-400' :
                          event.type === 'disconnected' ? 'bg-red-400' :
                          event.type === 'error' ? 'bg-red-400' :
                          'bg-yellow-400'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">{event.message}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {event.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Install instructions - always visible at bottom */}
              <div className="p-3 border-t border-border bg-secondary/20">
                <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <Server className="w-3 h-3 text-purple-400" />
                  Install Local Agent
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  The Local Agent enables real-time cluster data and kubectl operations.
                </p>
                <div className="bg-black/50 rounded p-2 font-mono text-[11px] text-green-400 mb-2 space-y-1">
                  <div className="text-muted-foreground"># Install via Homebrew</div>
                  <code className="block">brew tap kubestellar/tap</code>
                  <code className="block">brew install ksc-agent</code>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Visit{' '}
                  <a
                    href="https://github.com/kubestellar/homebrew-tap"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    github.com/kubestellar/homebrew-tap
                  </a>
                  {' '}for more information.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AI Agent Selector - shown when agent is connected */}
        {isConnected && !isDemoMode && (
          <AgentSelector compact showSettings={true} />
        )}

        {/* Language Selector */}
        <div className="relative" ref={languageRef}>
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title={currentLanguage.name}
          >
            <Globe className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">{currentLanguage.flag}</span>
          </button>

          {/* Language dropdown */}
          {showLanguageMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-xl py-1 z-50">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                    i18n.language === lang.code
                      ? 'bg-purple-500/20 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-sm">{lang.name}</span>
                  {i18n.language === lang.code && (
                    <Check className="w-4 h-4 ml-auto text-purple-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Token Usage */}
        <div className="relative" ref={tokenRef}>
          <button
            onClick={() => setShowTokenDetails(!showTokenDetails)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              alertLevel === 'stopped'
                ? 'bg-red-500/20 text-red-400'
                : alertLevel === 'critical'
                ? 'bg-red-500/10 text-red-400'
                : alertLevel === 'warning'
                ? 'bg-yellow-500/10 text-yellow-400'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
            title={`Token usage: ${percentage.toFixed(0)}%`}
          >
            <Coins className={cn("w-4 h-4 transition-transform", tokenAnimating && "animate-bounce text-yellow-400 scale-125")} />
            <span className="text-xs font-medium hidden sm:inline">{percentage.toFixed(0)}%</span>
            <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden hidden sm:block">
              <div
                className={`h-full transition-all ${
                  alertLevel === 'stopped' || alertLevel === 'critical'
                    ? 'bg-red-500'
                    : alertLevel === 'warning'
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </button>

          {/* Token details dropdown */}
          {showTokenDetails && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl p-4 z-50">
              <h4 className="text-sm font-medium text-foreground mb-3">Token Usage</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Used</span>
                  <span className="text-foreground font-mono">{usage.used.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Limit</span>
                  <span className="text-foreground font-mono">{usage.limit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-foreground font-mono">{remaining.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full transition-all ${
                      alertLevel === 'stopped' || alertLevel === 'critical'
                        ? 'bg-red-500'
                        : alertLevel === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className={`${
                    alertLevel === 'stopped'
                      ? 'text-red-400 font-medium'
                      : alertLevel === 'critical'
                      ? 'text-red-400'
                      : alertLevel === 'warning'
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}>
                    {alertLevel === 'stopped'
                      ? 'AI Disabled'
                      : alertLevel === 'critical'
                      ? 'Critical'
                      : alertLevel === 'warning'
                      ? 'Warning'
                      : 'Normal'}
                  </span>
                  <span className="text-muted-foreground">
                    Resets {new Date(usage.resetDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <button
                  onClick={() => navigate('/settings')}
                  className="w-full text-xs text-purple-400 hover:text-purple-300 text-center"
                >
                  Configure limits in Settings
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
          title={`Theme: ${theme} (click to toggle)`}
        >
          {theme === 'dark' ? (
            <Moon className="w-5 h-5 text-muted-foreground" />
          ) : theme === 'light' ? (
            <Sun className="w-5 h-5 text-yellow-400" />
          ) : (
            <Monitor className="w-5 h-5 text-muted-foreground" />
          )}
        </button>

        {/* Tour trigger */}
        <TourTrigger />

        {/* Active Users Badge */}
        {showActiveUsersBadge && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20"
            title={`${activeUsers} user${activeUsers !== 1 ? 's' : ''} online`}
          >
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">{activeUsers} online</span>
          </div>
        )}

        {/* Feature Request (includes notifications) */}
        <FeatureRequestButton />

        {/* Alerts */}
        <AlertBadge />

        {/* User menu */}
        <UserProfileDropdown
          user={user}
          onLogout={logout}
          onPreferences={() => navigate('/settings')}
          onFeedback={() => setShowFeedback(true)}
        />
      </div>

      {/* Feedback Modal */}
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
    </nav>
  )
}
