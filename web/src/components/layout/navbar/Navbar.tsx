import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor, Menu, X, MoreVertical } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { useTheme } from '../../../hooks/useTheme'
import { useMobile } from '../../../hooks/useMobile'
import { TourTrigger } from '../../onboarding/Tour'
import { UserProfileDropdown } from '../UserProfileDropdown'
import { AlertBadge } from '../../ui/AlertBadge'
import { FeatureRequestButton } from '../../feedback'
import { AgentSelector } from '../../agent/AgentSelector'
import { SearchDropdown } from './SearchDropdown'
import { TokenUsageWidget } from './TokenUsageWidget'
import { ClusterFilterPanel } from './ClusterFilterPanel'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { UpdateIndicator } from './UpdateIndicator'
import { ROUTES } from '../../../config/routes'

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [showMobileMore, setShowMobileMore] = useState(false)
  const { config, toggleMobileSidebar } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { t } = useTranslation()

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
          aria-label={config.isMobileOpen ? t('navbar.closeMenu') : t('navbar.openMenu')}
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
        <span className="text-base md:text-lg font-semibold text-foreground hidden lg:inline">KubeStellar Console</span>
      </div>

      {/* Search - hidden on small mobile */}
      <div className="hidden sm:block flex-1 max-w-md mx-4">
        <SearchDropdown />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 md:gap-3">
        {/* Core desktop items: md+ (768px) */}
        <div className="hidden md:flex items-center gap-2">
          {/* Global Filters (includes Clear Filters button) */}
          <ClusterFilterPanel />

          {/* Agent Status + Selector — status (Demo/AI pill) on left, selector on right */}
          <AgentStatusIndicator />
          <AgentSelector compact />
        </div>

        {/* Extended desktop items: lg+ (1024px) */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Update Indicator */}
          <UpdateIndicator />

          {/* Token Usage */}
          <TokenUsageWidget />

          {/* Feature Request (includes notifications) */}
          <FeatureRequestButton />
        </div>

        {/* Optional desktop items: xl+ (1280px) */}
        <div className="hidden xl:flex items-center gap-2">
          {/* Tour trigger */}
          <TourTrigger />
        </div>

        {/* Theme toggle - always visible */}
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
          title={t('navbar.themeToggle', { theme })}
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

        {/* Overflow menu — visible below lg for items hidden at narrow widths */}
        <div className="relative lg:hidden">
          <button
            onClick={() => setShowMobileMore(!showMobileMore)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label={t('navbar.moreOptions')}
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

                  {/* Items only hidden at <md (768px): filter, agent status, agent selector */}
                  <div className="md:hidden">
                    <div className="px-3 py-2">
                      <ClusterFilterPanel />
                    </div>
                    <div className="px-3 py-2">
                      <AgentStatusIndicator />
                    </div>
                    <div className="px-3 py-2">
                      <AgentSelector compact />
                    </div>
                    <div className="border-t border-border mx-3 my-1" />
                  </div>

                  {/* Items hidden at <lg (1024px): update, token usage, feature request, tour */}
                  <div className="px-3 py-2">
                    <UpdateIndicator />
                  </div>
                  <div className="px-3 py-2">
                    <TokenUsageWidget />
                  </div>
                  <div className="px-3 py-2">
                    <FeatureRequestButton />
                  </div>
                  <div className="px-3 py-2">
                    <TourTrigger />
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
          onPreferences={() => navigate(ROUTES.SETTINGS)}
        />
      </div>

    </nav>
  )
}
