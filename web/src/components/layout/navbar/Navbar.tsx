import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor, User, Cast, Menu, X, MoreVertical } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { useTheme } from '../../../hooks/useTheme'
import { useActiveUsers } from '../../../hooks/useActiveUsers'
import { usePresentationMode } from '../../../hooks/usePresentationMode'
import { useMobile } from '../../../hooks/useMobile'
import { TourTrigger } from '../../onboarding/Tour'
import { UserProfileDropdown } from '../UserProfileDropdown'
import { AlertBadge } from '../../ui/AlertBadge'
import { FeatureRequestButton, FeedbackModal } from '../../feedback'
import { AgentSelector } from '../../agent/AgentSelector'
import { SearchDropdown } from './SearchDropdown'
import { TokenUsageWidget } from './TokenUsageWidget'
import { ClusterFilterPanel } from './ClusterFilterPanel'
import { LanguageSelector } from './LanguageSelector'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { UpdateIndicator } from './UpdateIndicator'

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { isPresentationMode, togglePresentationMode } = usePresentationMode()
  const { viewerCount, isLoading: viewersLoading, hasError: viewersError, refetch } = useActiveUsers()
  const location = useLocation()
  const [showFeedback, setShowFeedback] = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const { config, toggleMobileSidebar } = useSidebarConfig()
  const { isMobile } = useMobile()

  // Refetch viewer count on page navigation
  useEffect(() => {
    refetch()
  }, [location.pathname, refetch])

  // Close mobile more menu on route change
  useEffect(() => {
    setShowMobileMore(false)
  }, [location.pathname])

  return (
    <nav data-tour="navbar" className="fixed top-0 left-0 right-0 h-16 glass z-50 px-3 md:px-6 flex items-center justify-between">
      {/* Left side: Hamburger + Logo */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Hamburger menu - mobile only */}
        <button
          onClick={toggleMobileSidebar}
          className="p-2 md:hidden hover:bg-secondary rounded-lg transition-colors"
          aria-label={config.isMobileOpen ? 'Close menu' : 'Open menu'}
        >
          {config.isMobileOpen ? (
            <X className="w-5 h-5 text-foreground" />
          ) : (
            <Menu className="w-5 h-5 text-foreground" />
          )}
        </button>

        {/* Logo */}
        <img
          src="/kubestellar-logo.svg"
          alt="KubeStellar"
          className="w-8 h-8 md:w-9 md:h-9"
        />
        <span className="text-base md:text-lg font-semibold text-foreground hidden sm:inline">KubeStellar Console</span>
      </div>

      {/* Search - hidden on small mobile */}
      <div className="hidden sm:block flex-1 max-w-md mx-4">
        <SearchDropdown />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 md:gap-3">
        {/* Desktop-only items */}
        <div className="hidden md:flex items-center gap-3">
          {/* Global Filters (includes Clear Filters button) */}
          <ClusterFilterPanel />

          {/* Update Indicator */}
          <UpdateIndicator />

          {/* Agent Status + Selector — status (Demo/AI pill) on left, selector on right */}
          <AgentStatusIndicator />
          <AgentSelector compact />

          {/* Language Selector */}
          <LanguageSelector />

          {/* Token Usage */}
          <TokenUsageWidget />

          {/* Presentation Mode toggle */}
          <button
            onClick={togglePresentationMode}
            className={isPresentationMode
              ? 'p-2 rounded-lg transition-colors bg-blue-500/20 text-blue-400'
              : 'p-2 rounded-lg transition-colors hover:bg-secondary text-muted-foreground'
            }
            title={isPresentationMode ? 'Presentation Mode ON (click to disable)' : 'Enable Presentation Mode (reduces animations for screen sharing)'}
          >
            <Cast className="w-5 h-5" />
          </button>

          {/* Tour trigger */}
          <TourTrigger />

          {/* Active Viewers */}
          <div 
            className="flex items-center gap-1 px-1.5 py-1.5 text-muted-foreground"
            title={viewersError ? 'Failed to load viewer count' : viewersLoading ? 'Loading viewers...' : `${viewerCount} active viewer${viewerCount !== 1 ? 's' : ''}`}
          >
            <User className={`w-4 h-4 ${viewersError ? 'text-red-400' : ''}`} />
            <span className={`text-xs tabular-nums ${viewersLoading ? 'animate-pulse' : ''}`}>
              {viewersError ? '!' : viewerCount}
            </span>
          </div>

          {/* Feature Request (includes notifications) */}
          <FeatureRequestButton />
        </div>

        {/* Theme toggle - always visible */}
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

        {/* Alerts - always visible */}
        <AlertBadge />

        {/* Mobile overflow menu - simplified for mobile */}
        <div className="relative md:hidden">
          <button
            onClick={() => setShowMobileMore(!showMobileMore)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </button>
          {showMobileMore && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setShowMobileMore(false)}
              />
              {/* Bottom sheet menu on mobile */}
              <div className={`fixed ${isMobile ? 'inset-x-0 bottom-0 rounded-t-2xl max-h-[60vh]' : 'right-4 top-16 w-64 rounded-lg'} bg-card border border-border shadow-xl z-50 overflow-hidden`}>
                {/* Drag handle for mobile */}
                {isMobile && (
                  <div className="flex justify-center py-2">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                  </div>
                )}
                <div className={`${isMobile ? 'max-h-[calc(60vh-24px)]' : ''} overflow-y-auto py-2`}>
                  {/* Search on mobile */}
                  <div className="px-3 py-2 sm:hidden">
                    <SearchDropdown />
                  </div>
                  <div className="border-t border-border my-2 sm:hidden" />

                  {/* Simplified mobile menu - only essential items */}
                  <div className="px-3 py-2">
                    <AgentStatusIndicator />
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Language</span>
                    <LanguageSelector />
                  </div>
                  <div className="border-t border-border my-2" />
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Viewers</span>
                    <div 
                      className="flex items-center gap-1 text-muted-foreground"
                      title={viewersError ? 'Failed to load viewer count' : viewersLoading ? 'Loading viewers...' : `${viewerCount} active viewer${viewerCount !== 1 ? 's' : ''}`}
                    >
                      <User className={`w-4 h-4 ${viewersError ? 'text-red-400' : ''}`} />
                      <span className={`text-xs tabular-nums ${viewersLoading ? 'animate-pulse' : ''}`}>
                        {viewersError ? '!' : viewerCount}
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <FeatureRequestButton />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu - always visible */}
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
