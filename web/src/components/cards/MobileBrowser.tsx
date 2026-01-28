import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Grid3X3,
  Plus, X, Lock, Bookmark, Star,
  Wifi, Battery, Signal
} from 'lucide-react'
import { useCardExpanded } from './CardWrapper'

interface Tab {
  id: string
  url: string
  title: string
  favicon?: string
}

interface SavedBookmark {
  url: string
  title: string
  icon?: string
}

const STORAGE_KEY = 'mobile_browser_state'
const BOOKMARKS_KEY = 'mobile_browser_bookmarks'

// Device dimensions - iPhone for normal view, iPad horizontal for expanded/fullscreen
const IPHONE_WIDTH = 375
const IPHONE_HEIGHT = 667
const IPAD_WIDTH = 1024
const IPAD_HEIGHT = 768

// Popular mobile-friendly sites
const QUICK_LINKS = [
  { title: 'KubeStellar', url: 'https://kubestellar.io', icon: '⭐' },
  { title: 'Google', url: 'https://www.google.com', icon: '🔍' },
  { title: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { title: 'Wikipedia', url: 'https://en.m.wikipedia.org', icon: '📚' },
  { title: 'YouTube', url: 'https://m.youtube.com', icon: '▶️' },
  { title: 'News', url: 'https://news.ycombinator.com', icon: '📰' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '💻' },
]

export function MobileBrowser() {
  const { isExpanded } = useCardExpanded()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Detect container size to determine if iPad view should be used
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      setContainerWidth(container.clientWidth)
    }

    // Initial measurement
    updateWidth()

    // Observe resize
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  // Use iPad dimensions when expanded OR when container is large enough (> 1100px)
  // This handles both fullscreen modal and full-width card resize
  const shouldUseIPad = isExpanded || containerWidth > 1100
  const DEVICE_WIDTH = shouldUseIPad ? IPAD_WIDTH : IPHONE_WIDTH
  const DEVICE_HEIGHT = shouldUseIPad ? IPAD_HEIGHT : IPHONE_HEIGHT
  const isIPad = shouldUseIPad

  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return parsed.tabs || [{ id: '1', url: 'https://kubestellar.io', title: 'KubeStellar' }]
      }
    } catch { /* ignore */ }
    return [{ id: '1', url: 'https://kubestellar.io', title: 'KubeStellar' }]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return parsed.activeTabId || '1'
      }
    } catch { /* ignore */ }
    return '1'
  })
  const [urlInput, setUrlInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showTabs, setShowTabs] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>(() => {
    try {
      const saved = localStorage.getItem(BOOKMARKS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }))
  }, [tabs, activeTabId])

  useEffect(() => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
  }, [bookmarks])

  // Sync URL input with active tab
  useEffect(() => {
    setUrlInput(activeTab?.url || '')
  }, [activeTabId, activeTab?.url])

  const navigateTo = useCallback((url: string) => {
    if (!url.trim()) return

    let fullUrl = url.trim()
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      // Check if it looks like a URL or a search query
      if (fullUrl.includes('.') && !fullUrl.includes(' ')) {
        fullUrl = 'https://' + fullUrl
      } else {
        // Treat as search query
        fullUrl = 'https://www.google.com/search?q=' + encodeURIComponent(fullUrl)
      }
    }

    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, url: fullUrl, title: new URL(fullUrl).hostname }
        : tab
    ))
    setUrlInput(fullUrl)
    setIsLoading(true)

    // Update history
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(fullUrl)
      return newHistory
    })
    setHistoryIndex(prev => prev + 1)
  }, [activeTabId, historyIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      navigateTo(urlInput)
    }
  }, [navigateTo, urlInput])

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const url = history[newIndex]
      setTabs(prev => prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, url, title: new URL(url).hostname }
          : tab
      ))
      setUrlInput(url)
    }
  }, [historyIndex, history, activeTabId])

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const url = history[newIndex]
      setTabs(prev => prev.map(tab =>
        tab.id === activeTabId
          ? { ...tab, url, title: new URL(url).hostname }
          : tab
      ))
      setUrlInput(url)
    }
  }, [historyIndex, history, activeTabId])

  const newTab = useCallback(() => {
    const id = Date.now().toString()
    setTabs(prev => [...prev, { id, url: '', title: 'New Tab' }])
    setActiveTabId(id)
    setShowTabs(false)
    setHistory([])
    setHistoryIndex(-1)
  }, [])

  const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) {
      // Don't close last tab, just clear it
      setTabs([{ id: '1', url: '', title: 'New Tab' }])
      setActiveTabId('1')
    } else {
      setTabs(prev => prev.filter(t => t.id !== tabId))
      if (activeTabId === tabId) {
        setActiveTabId(tabs[0].id === tabId ? tabs[1].id : tabs[0].id)
      }
    }
  }, [tabs, activeTabId])

  const addBookmark = useCallback(() => {
    if (activeTab.url) {
      const exists = bookmarks.some(b => b.url === activeTab.url)
      if (!exists) {
        setBookmarks(prev => [...prev, { url: activeTab.url, title: activeTab.title }])
      }
    }
  }, [activeTab, bookmarks])

  const isBookmarked = bookmarks.some(b => b.url === activeTab.url)

  // Get current time for status bar
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
        {/* Device Frame - iPhone or iPad based on expanded state */}
        <div
          className={`relative bg-black shadow-2xl ${isIPad ? 'rounded-[24px] p-3' : 'rounded-[40px] p-2'}`}
          style={{ width: DEVICE_WIDTH + (isIPad ? 24 : 16), height: DEVICE_HEIGHT + (isIPad ? 24 : 16) }}
        >
          {/* Screen */}
          <div
            className={`relative bg-white dark:bg-zinc-900 overflow-hidden ${isIPad ? 'rounded-[16px]' : 'rounded-[32px]'}`}
            style={{ width: DEVICE_WIDTH, height: DEVICE_HEIGHT }}
          >
            {/* Dynamic Island / Notch - only for iPhone */}
            {!isIPad && (
              <div className="absolute top-0 left-0 right-0 z-20">
                <div className="flex justify-center pt-2">
                  <div className="bg-black rounded-full px-6 py-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-700" /> {/* Camera */}
                  </div>
                </div>
              </div>
            )}

            {/* Status Bar */}
            <div className={`absolute top-0 left-0 right-0 z-10 flex justify-between items-center text-xs ${isIPad ? 'px-8 pt-3' : 'px-6 pt-2'}`}>
              <span className="font-semibold text-black dark:text-white">{formattedTime}</span>
              <div className="flex items-center gap-1 text-black dark:text-white">
                <Signal className="w-3 h-3" />
                <Wifi className="w-3 h-3" />
                <Battery className="w-4 h-3" />
              </div>
            </div>

            {/* Safari-style Address Bar */}
            <div className={`absolute left-0 right-0 z-10 px-2 pt-2 ${isIPad ? 'top-6' : 'top-8'}`}>
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
                {activeTab.url && (
                  <Lock className="w-3 h-3 text-green-500 flex-shrink-0" />
                )}
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or enter website name"
                  className="flex-1 bg-transparent text-xs text-center text-zinc-700 dark:text-zinc-300 focus:outline-none min-w-0"
                />
                {urlInput && (
                  <button
                    onClick={() => setUrlInput('')}
                    className="text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className={`absolute left-0 right-0 bottom-12 overflow-hidden bg-white dark:bg-zinc-900 ${isIPad ? 'top-[56px]' : 'top-[72px]'}`}>
              {activeTab.url ? (
                <>
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80 z-10">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    src={activeTab.url}
                    title="Mobile Browser"
                    className="w-full h-full border-none"
                    style={{
                      transform: 'scale(1)',
                      transformOrigin: 'top left',
                    }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={() => setIsLoading(false)}
                    onError={() => setIsLoading(false)}
                  />
                </>
              ) : (
                /* New Tab Page */
                <div className="h-full p-4 overflow-auto">
                  {/* Bookmarks */}
                  {bookmarks.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold text-zinc-500 mb-2">Favorites</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {bookmarks.slice(0, 8).map((bookmark, i) => (
                          <button
                            key={i}
                            onClick={() => navigateTo(bookmark.url)}
                            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg">
                              {bookmark.title.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate max-w-full">
                              {bookmark.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Links */}
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-500 mb-2">Quick Links</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {QUICK_LINKS.map((link) => (
                        <button
                          key={link.url}
                          onClick={() => navigateTo(link.url)}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl">
                            {link.icon}
                          </div>
                          <span className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate max-w-full">
                            {link.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tab Switcher Overlay */}
            {showTabs && (
              <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-900 z-30 p-4 overflow-auto">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {tabs.length} Tab{tabs.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setShowTabs(false)}
                    className="text-blue-500 text-sm font-medium"
                  >
                    Done
                  </button>
                </div>
                <div className="grid gap-3">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTabId(tab.id)
                        setShowTabs(false)
                      }}
                      className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
                        tab.id === activeTabId
                          ? 'border-blue-500'
                          : 'border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <div className="bg-white dark:bg-zinc-800 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                            {tab.title || 'New Tab'}
                          </span>
                          <button
                            onClick={(e) => closeTab(tab.id, e)}
                            className="text-zinc-400 hover:text-zinc-600 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {tab.url && (
                          <span className="text-[10px] text-zinc-500 truncate block">
                            {tab.url}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={newTab}
                  className="mt-4 w-full py-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg text-sm text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Tab
                </button>
              </div>
            )}

            {/* Settings Overlay */}
            {showSettings && (
              <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-900 z-30 p-4 overflow-auto">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    Bookmarks
                  </span>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="text-blue-500 text-sm font-medium"
                  >
                    Done
                  </button>
                </div>
                {bookmarks.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-8">
                    No bookmarks yet. Tap the star icon to add one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map((bookmark, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 bg-white dark:bg-zinc-800 rounded-lg"
                      >
                        <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm">
                          {bookmark.title.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => {
                              navigateTo(bookmark.url)
                              setShowSettings(false)
                            }}
                            className="text-left"
                          >
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block truncate">
                              {bookmark.title}
                            </span>
                            <span className="text-[10px] text-zinc-500 truncate block">
                              {bookmark.url}
                            </span>
                          </button>
                        </div>
                        <button
                          onClick={() => setBookmarks(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-500 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Navigation Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-around px-4">
              <button
                onClick={goBack}
                disabled={historyIndex <= 0}
                className={`p-2 ${historyIndex <= 0 ? 'text-zinc-300 dark:text-zinc-700' : 'text-blue-500'}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goForward}
                disabled={historyIndex >= history.length - 1}
                className={`p-2 ${historyIndex >= history.length - 1 ? 'text-zinc-300 dark:text-zinc-700' : 'text-blue-500'}`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-blue-500"
              >
                <Bookmark className="w-5 h-5" />
              </button>
              <button
                onClick={addBookmark}
                disabled={!activeTab.url}
                className={`p-2 ${!activeTab.url ? 'text-zinc-300 dark:text-zinc-700' : isBookmarked ? 'text-yellow-500' : 'text-blue-500'}`}
              >
                <Star className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => setShowTabs(true)}
                className="p-2 text-blue-500 relative"
              >
                <Grid3X3 className="w-5 h-5" />
                {tabs.length > 1 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center">
                    {tabs.length}
                  </span>
                )}
              </button>
            </div>

            {/* Home Indicator */}
            <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full ${isIPad ? 'w-32' : 'w-24'}`} />
          </div>
        </div>

      </div>
    </div>
  )
}
