import { useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Cpu, TrendingUp, Coins, User, Bell, Shield,
  Palette, Eye, Plug, Github, Key, LayoutGrid, Download, Database, Container
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAccessibility } from '../../hooks/useAccessibility'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { usePredictionSettings } from '../../hooks/usePredictionSettings'
import { UpdateSettings } from './UpdateSettings'
import {
  AISettingsSection,
  ProfileSection,
  AgentSection,
  GitHubTokenSection,
  APIKeysSection,
  TokenUsageSection,
  ThemeSection,
  AccessibilitySection,
  PermissionsSection,
  PredictionSettingsSection,
  WidgetSettingsSection,
  NotificationSettingsSection,
  PersistenceSection,
  LocalClustersSection,
} from './sections'
import { cn } from '../../lib/cn'

// Define settings navigation structure with groups
const SETTINGS_NAV = [
  {
    group: 'AI & Intelligence',
    items: [
      { id: 'ai-mode-settings', label: 'AI Mode', icon: Cpu },
      { id: 'prediction-settings', label: 'Predictions', icon: TrendingUp },
      { id: 'agent-settings', label: 'Local Agent', icon: Plug },
      { id: 'api-keys-settings', label: 'API Keys', icon: Key },
      { id: 'token-usage-settings', label: 'Token Usage', icon: Coins },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { id: 'github-token-settings', label: 'GitHub', icon: Github },
      { id: 'widget-settings', label: 'Desktop Widget', icon: LayoutGrid },
      { id: 'persistence-settings', label: 'Deploy Persistence', icon: Database },
    ],
  },
  {
    group: 'User & Alerts',
    items: [
      { id: 'profile-settings', label: 'Profile', icon: User },
      { id: 'notifications-settings', label: 'Notifications', icon: Bell },
    ],
  },
  {
    group: 'Appearance',
    items: [
      { id: 'theme-settings', label: 'Theme', icon: Palette },
      { id: 'accessibility-settings', label: 'Accessibility', icon: Eye },
    ],
  },
  {
    group: 'Utilities',
    items: [
      { id: 'local-clusters-settings', label: 'Local Clusters', icon: Container },
      { id: 'permissions-settings', label: 'Permissions', icon: Shield },
      { id: 'system-updates-settings', label: 'Updates', icon: Download },
    ],
  },
]

export function Settings() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const { themeId, setTheme, themes, currentTheme } = useTheme()
  const { usage, updateSettings, resetUsage } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh } = useLocalAgent()
  const { colorBlindMode, setColorBlindMode, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useAccessibility()
  const { forceCheck: forceVersionCheck } = useVersionCheck()
  const { settings: predictionSettings, updateSettings: updatePredictionSettings, resetSettings: resetPredictionSettings } = usePredictionSettings()

  const [activeSection, setActiveSection] = useState<string>('ai-mode-settings')
  const contentRef = useRef<HTMLDivElement>(null)

  // Handle deep linking - scroll to section based on URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash) {
      // Small delay to ensure sections are rendered
      const scrollToElement = () => {
        const element = document.getElementById(hash)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          setActiveSection(hash)
          // Add a brief highlight effect
          element.classList.add('ring-2', 'ring-purple-500/50')
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-purple-500/50')
          }, 2000)
        }
      }
      // Wait for render
      setTimeout(scrollToElement, 100)
    }
  }, [location.hash])

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      const allSections = SETTINGS_NAV.flatMap(g => g.items.map(i => i.id))
      for (const sectionId of allSections) {
        const el = document.getElementById(sectionId)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 200 && rect.bottom > 100) {
            setActiveSection(sectionId)
            break
          }
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(sectionId)
      navigate(`#${sectionId}`, { replace: true })
    }
  }

  return (
    <div data-testid="settings-page" className="pt-16 max-w-6xl mx-auto flex gap-6">
      {/* Sidebar Navigation */}
      <nav className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-20 space-y-4">
          <div className="mb-4">
            <h1 data-testid="settings-title" className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Configure console preferences</p>
          </div>
          {SETTINGS_NAV.map((group) => (
            <div key={group.group}>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 px-2">
                {group.group}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                        isActive
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-purple-400' : 'text-muted-foreground')} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <div ref={contentRef} className="flex-1 min-w-0">
        {/* Mobile Header */}
        <div className="lg:hidden mb-6">
          <h1 data-testid="settings-title-mobile" className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure console preferences and AI usage</p>
        </div>

        {/* AI & Intelligence Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            AI & Intelligence
          </h2>
          <div className="space-y-6">
            <AISettingsSection mode={mode} setMode={setMode} description={description} />
            <PredictionSettingsSection
              settings={predictionSettings}
              updateSettings={updatePredictionSettings}
              resetSettings={resetPredictionSettings}
            />
            <AgentSection isConnected={isConnected} health={health} refresh={refresh} />
            <APIKeysSection />
            <TokenUsageSection usage={usage} updateSettings={updateSettings} resetUsage={resetUsage} />
          </div>
        </div>

        {/* Integrations Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            Integrations
          </h2>
          <div className="space-y-6">
            <GitHubTokenSection forceVersionCheck={forceVersionCheck} />
            <WidgetSettingsSection />
            <PersistenceSection />
          </div>
        </div>

        {/* User & Alerts Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            User & Alerts
          </h2>
          <div className="space-y-6">
            <ProfileSection
              initialEmail={user?.email || ''}
              initialSlackId={user?.slackId || ''}
              refreshUser={refreshUser}
            />
            <NotificationSettingsSection />
          </div>
        </div>

        {/* Appearance Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            Appearance
          </h2>
          <div className="space-y-6">
            <ThemeSection
              themeId={themeId}
              setTheme={setTheme}
              themes={themes}
              currentTheme={currentTheme}
            />
            <AccessibilitySection
              colorBlindMode={colorBlindMode}
              setColorBlindMode={setColorBlindMode}
              reduceMotion={reduceMotion}
              setReduceMotion={setReduceMotion}
              highContrast={highContrast}
              setHighContrast={setHighContrast}
            />
          </div>
        </div>

        {/* Utilities Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            Utilities
          </h2>
          <div className="space-y-6">
            <LocalClustersSection />
            <PermissionsSection />
            <UpdateSettings />
          </div>
        </div>
      </div>
    </div>
  )
}
