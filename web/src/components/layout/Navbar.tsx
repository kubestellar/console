import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, User, LogOut, Server, Box, Activity, Command, Sun, Moon, Monitor, Coins } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { TourTrigger } from '../onboarding/Tour'

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
  { type: 'page', name: 'Applications', description: 'View applications', href: '/apps', icon: Box },
  { type: 'page', name: 'Events', description: 'Cluster events', href: '/events', icon: Activity },
  { type: 'page', name: 'Security', description: 'RBAC & policies', href: '/security', icon: Command },
  { type: 'page', name: 'GitOps', description: 'Drift detection', href: '/gitops', icon: Command },
  { type: 'page', name: 'Settings', description: 'Console settings', href: '/settings', icon: Command },
  { type: 'cluster', name: 'kind-local', description: 'Local development cluster', href: '/clusters?name=kind-local', icon: Server },
  { type: 'cluster', name: 'vllm-d', description: 'Production GPU cluster', href: '/clusters?name=vllm-d', icon: Server },
  { type: 'app', name: 'nginx-ingress', description: 'Ingress controller', href: '/apps?name=nginx-ingress', icon: Box },
  { type: 'app', name: 'prometheus', description: 'Monitoring stack', href: '/apps?name=prometheus', icon: Box },
]

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { usage, alertLevel, percentage, remaining } = useTokenUsage()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showTokenDetails, setShowTokenDetails] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLDivElement>(null)

  // Filter results based on query
  const searchResults = searchQuery.trim()
    ? searchableItems.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Close search and token dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
      if (tokenRef.current && !tokenRef.current.contains(event.target as Node)) {
        setShowTokenDetails(false)
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
        <span className="text-lg font-semibold text-white">KubeStellar Klaude Console</span>
      </div>

      {/* Search */}
      <div data-tour="search" className="flex-1 max-w-md mx-8" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setIsSearchOpen(true)
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="Search clusters, apps, pods..."
            className="w-full pl-10 pr-16 py-2 bg-secondary/50 rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                          ? 'bg-purple-500/20 text-white'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-white'
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
                : 'bg-secondary/50 text-muted-foreground hover:text-white'
            }`}
            title={`Token usage: ${percentage.toFixed(0)}%`}
          >
            <Coins className="w-4 h-4" />
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
              <h4 className="text-sm font-medium text-white mb-3">Token Usage</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Used</span>
                  <span className="text-white font-mono">{usage.used.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Limit</span>
                  <span className="text-white font-mono">{usage.limit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-white font-mono">{remaining.toLocaleString()}</span>
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

        {/* Notifications */}
        <button className="relative p-2 hover:bg-secondary rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full" />
        </button>

        {/* User menu */}
        <div className="flex items-center gap-3 pl-3 border-l border-border">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.github_login}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-purple-400" />
            </div>
          )}
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground">{user?.github_login}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </nav>
  )
}
