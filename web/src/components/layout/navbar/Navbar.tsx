import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Monitor, Users, Cast } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useTheme } from '../../../hooks/useTheme'
import { useActiveUsers } from '../../../hooks/useActiveUsers'
import { usePresentationMode } from '../../../hooks/usePresentationMode'
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
  const { activeUsers, showBadge: showActiveUsersBadge } = useActiveUsers()
  const [showFeedback, setShowFeedback] = useState(false)

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
      <SearchDropdown />

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Global Filters (includes Clear Filters button) */}
        <ClusterFilterPanel />

        {/* Update Indicator */}
        <UpdateIndicator />

        {/* Agent area — fixed-width wrapper prevents layout shift when selector toggles */}
        <div className="flex items-center justify-end gap-1 shrink-0" style={{ minWidth: '10rem' }}>
          <AgentSelector compact showSettings={true} />
          <AgentStatusIndicator />
        </div>

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
