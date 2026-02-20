import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Cpu, TrendingUp, Coins, User, Bell, Shield,
  Palette, Eye, Plug, Github, Key, LayoutGrid, Download, Database, Container, HardDrive,
  CheckCircle, Loader2, AlertCircle, WifiOff, BarChart3,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAccessibility } from '../../hooks/useAccessibility'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { usePredictionSettings } from '../../hooks/usePredictionSettings'
import { usePersistedSettings, type SyncStatus } from '../../hooks/usePersistedSettings'
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
  SettingsBackupSection,
  AnalyticsSection,
} from './sections'
import { cn } from '../../lib/cn'

// Labels are filled at render time via t()
const SYNC_ICONS: Record<SyncStatus, { icon: typeof CheckCircle; className: string }> = {
  idle:    { icon: CheckCircle, className: 'text-muted-foreground' },
  saving:  { icon: Loader2,     className: 'text-yellow-400' },
  saved:   { icon: CheckCircle, className: 'text-green-400' },
  error:   { icon: AlertCircle, className: 'text-red-400' },
  offline: { icon: WifiOff,     className: 'text-muted-foreground' },
}

// Define settings navigation structure with groups
// Labels use i18n keys resolved at render time
const SETTINGS_NAV = [
  {
    groupKey: 'settings.groups.aiIntelligence',
    items: [
      { id: 'ai-mode-settings', labelKey: 'settings.nav.aiMode', icon: Cpu },
      { id: 'prediction-settings', labelKey: 'settings.nav.predictions', icon: TrendingUp },
      { id: 'agent-settings', labelKey: 'settings.nav.localAgent', icon: Plug },
      { id: 'api-keys-settings', labelKey: 'settings.nav.apiKeys', icon: Key },
      { id: 'token-usage-settings', labelKey: 'settings.nav.tokenUsage', icon: Coins },
    ],
  },
  {
    groupKey: 'settings.groups.integrations',
    items: [
      { id: 'github-token-settings', labelKey: 'settings.nav.github', icon: Github },
      { id: 'widget-settings', labelKey: 'settings.nav.desktopWidget', icon: LayoutGrid },
      { id: 'persistence-settings', labelKey: 'settings.nav.deployPersistence', icon: Database },
    ],
  },
  {
    groupKey: 'settings.groups.userAlerts',
    items: [
      { id: 'profile-settings', labelKey: 'settings.nav.profile', icon: User },
      { id: 'notifications-settings', labelKey: 'settings.nav.notifications', icon: Bell },
    ],
  },
  {
    groupKey: 'settings.groups.appearance',
    items: [
      { id: 'theme-settings', labelKey: 'settings.nav.theme', icon: Palette },
      { id: 'accessibility-settings', labelKey: 'settings.nav.accessibility', icon: Eye },
    ],
  },
  {
    groupKey: 'settings.groups.utilities',
    items: [
      { id: 'settings-backup', labelKey: 'settings.nav.backupSync', icon: HardDrive },
      { id: 'local-clusters-settings', labelKey: 'settings.nav.localClusters', icon: Container },
      { id: 'permissions-settings', labelKey: 'settings.nav.permissions', icon: Shield },
      { id: 'analytics-settings', labelKey: 'settings.nav.analytics', icon: BarChart3 },
      { id: 'system-updates-settings', labelKey: 'settings.nav.updates', icon: Download },
    ],
  },
]

export function Settings() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, refreshUser, isLoading: isUserLoading } = useAuth()
  const { themeId, setTheme, themes, currentTheme } = useTheme()
  const { usage, updateSettings, resetUsage, isDemoData } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh } = useLocalAgent()
  const { colorBlindMode, setColorBlindMode, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useAccessibility()
  const { forceCheck: forceVersionCheck } = useVersionCheck()
  const { settings: predictionSettings, updateSettings: updatePredictionSettings, resetSettings: resetPredictionSettings } = usePredictionSettings()
  const { restoredFromFile, syncStatus, lastSaved, filePath, exportSettings, importSettings } = usePersistedSettings()

  const [activeSection, setActiveSection] = useState<string>('ai-mode-settings')
  const [showRestoredToast, setShowRestoredToast] = useState(false)

  // Show toast when settings are restored from backup file (after cache clear)
  useEffect(() => {
    if (restoredFromFile) {
      setShowRestoredToast(true)
      const timer = setTimeout(() => setShowRestoredToast(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [restoredFromFile])
  const contentRef = useRef<HTMLDivElement>(null)

  // Offset for sticky navbar (px from top of viewport)
  const SCROLL_OFFSET = 80

  const scrollToSection = (sectionId: string, smooth = true) => {
    const element = document.getElementById(sectionId)
    if (!element) return
    const y = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET - 16
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Handle deep linking - scroll to section based on URL hash
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash) {
      const timer = setTimeout(() => {
        scrollToSection(hash, false)
        setActiveSection(hash)
        const element = document.getElementById(hash)
        if (element) {
          element.classList.add('ring-2', 'ring-purple-500/50')
          setTimeout(() => element.classList.remove('ring-2', 'ring-purple-500/50'), 2000)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [location.hash])

  // Track active section on scroll using IntersectionObserver
  useEffect(() => {
    const allSectionIds = SETTINGS_NAV.flatMap(g => g.items.map(i => i.id))
    const visibleSections = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio)
          } else {
            visibleSections.delete(entry.target.id)
          }
        }
        // Pick the first visible section in document order
        for (const id of allSectionIds) {
          if (visibleSections.has(id)) {
            setActiveSection(id)
            break
          }
        }
      },
      {
        rootMargin: `-${SCROLL_OFFSET}px 0px -40% 0px`,
        threshold: [0, 0.1, 0.5],
      }
    )

    for (const id of allSectionIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [])

  const handleNavClick = (sectionId: string) => {
    scrollToSection(sectionId)
    setActiveSection(sectionId)
    navigate(`#${sectionId}`, { replace: true })
  }

  const SYNC_LABELS: Record<SyncStatus, string> = {
    idle: t('settings.syncStatus.synced'),
    saving: t('settings.syncStatus.saving'),
    saved: t('settings.syncStatus.savedToFile'),
    error: t('settings.syncStatus.saveFailed'),
    offline: t('settings.syncStatus.localOnly'),
  }
  const sync = SYNC_ICONS[syncStatus]
  const SyncIcon = sync.icon
  const syncLabel = SYNC_LABELS[syncStatus]

  return (
    <div data-testid="settings-page" className="pt-16 max-w-6xl mx-auto flex gap-6">
      {/* Settings restored toast */}
      {showRestoredToast && (
        <div className="fixed top-20 right-4 z-50 bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-right">
          {t('settings.restoredFromBackup')}
        </div>
      )}
      {/* Sidebar Navigation */}
      <nav className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-20 space-y-4">
          <div className="mb-4">
            <h1 data-testid="settings-title" className="text-xl font-bold text-foreground">{t('settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
            <div className={cn('flex items-center gap-1.5 mt-2 text-xs', sync.className)}>
              <SyncIcon className={cn('w-3.5 h-3.5', syncStatus === 'saving' && 'animate-spin')} />
              <span>{syncLabel}</span>
            </div>
          </div>
          {SETTINGS_NAV.map((group) => (
            <div key={group.groupKey}>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 px-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t(group.groupKey as any)}
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
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span className="truncate">{t(item.labelKey as any)}</span>
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
          <h1 data-testid="settings-title-mobile" className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.subtitle')}</p>
          <div className={cn('flex items-center gap-1.5 mt-2 text-xs', sync.className)}>
            <SyncIcon className={cn('w-3.5 h-3.5', syncStatus === 'saving' && 'animate-spin')} />
            <span>{syncLabel}</span>
          </div>
        </div>

        {/* AI & Intelligence Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            {t('settings.groups.aiIntelligence')}
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
            <TokenUsageSection usage={usage} updateSettings={updateSettings} resetUsage={resetUsage} isDemoData={isDemoData} />
          </div>
        </div>

        {/* Integrations Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            {t('settings.groups.integrations')}
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
            {t('settings.groups.userAlerts')}
          </h2>
          <div className="space-y-6">
            <ProfileSection
              initialEmail={user?.email || ''}
              initialSlackId={user?.slackId || ''}
              refreshUser={refreshUser}
              isLoading={isUserLoading}
            />
            <NotificationSettingsSection />
          </div>
        </div>

        {/* Appearance Group */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
            {t('settings.groups.appearance')}
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
            {t('settings.groups.utilities')}
          </h2>
          <div className="space-y-6">
            <SettingsBackupSection
              syncStatus={syncStatus}
              lastSaved={lastSaved}
              filePath={filePath}
              onExport={exportSettings}
              onImport={importSettings}
            />
            <LocalClustersSection />
            <PermissionsSection />
            <AnalyticsSection />
            <UpdateSettings />
          </div>
        </div>
      </div>
    </div>
  )
}
