import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Server, Box, Activity, Command } from 'lucide-react'

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

export function SearchDropdown() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter results based on query
  const searchResults = searchQuery.trim()
    ? searchableItems.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
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
                <p className="text-muted-foreground text-sm">No results for &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
