/* eslint-disable react-refresh/only-export-components */
import { type LucideIcon } from 'lucide-react'
import {
  Cpu,
  TrendingUp,
  Coins,
  User,
  Bell,
  Shield,
  Palette,
  Eye,
  Plug,
  LayoutGrid,
  Download,
  Database,
  Container,
  HardDrive,
  CheckCircle,
  Loader2,
  AlertCircle,
  WifiOff,
  BarChart3,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Github } from '@/lib/icons'
import { type SyncStatus } from '../../hooks/usePersistedSettings'
import { cn } from '../../lib/cn'

export type SettingsNavItem = {
  id: string
  labelKey: string
  icon: LucideIcon
}

export type SettingsNavGroup = {
  groupKey: string
  items: SettingsNavItem[]
}

export type SettingsGroupKey = (typeof SETTINGS_NAV)[number]['groupKey']

// Labels use i18n keys resolved at render time. `as const` on each key keeps the
// literal string type so it satisfies the typed i18next `t()` signature.
export const SETTINGS_NAV = [
  {
    groupKey: 'settings.groups.aiIntelligence' as const,
    items: [
      { id: 'ai-mode-settings', labelKey: 'settings.nav.aiMode' as const, icon: Cpu },
      { id: 'prediction-settings', labelKey: 'settings.nav.predictions' as const, icon: TrendingUp },
      { id: 'agent-settings', labelKey: 'settings.nav.localAgent' as const, icon: Plug },
      { id: 'token-usage-settings', labelKey: 'settings.nav.tokenUsage' as const, icon: Coins },
    ],
  },
  {
    groupKey: 'settings.groups.integrations' as const,
    items: [
      { id: 'github-token-settings', labelKey: 'settings.nav.github' as const, icon: Github },
      { id: 'widget-settings', labelKey: 'settings.nav.desktopWidget' as const, icon: LayoutGrid },
      { id: 'persistence-settings', labelKey: 'settings.nav.deployPersistence' as const, icon: Database },
    ],
  },
  {
    groupKey: 'settings.groups.userAlerts' as const,
    items: [
      { id: 'profile-settings', labelKey: 'settings.nav.profile' as const, icon: User },
      { id: 'notifications-settings', labelKey: 'settings.nav.notifications' as const, icon: Bell },
    ],
  },
  {
    groupKey: 'settings.groups.appearance' as const,
    items: [
      { id: 'theme-settings', labelKey: 'settings.nav.theme' as const, icon: Palette },
      { id: 'accessibility-settings', labelKey: 'settings.nav.accessibility' as const, icon: Eye },
    ],
  },
  {
    groupKey: 'settings.groups.utilities' as const,
    items: [
      { id: 'settings-backup', labelKey: 'settings.nav.backupSync' as const, icon: HardDrive },
      { id: 'local-clusters-settings', labelKey: 'settings.nav.localClusters' as const, icon: Container },
      { id: 'permissions-settings', labelKey: 'settings.nav.permissions' as const, icon: Shield },
      { id: 'analytics-settings', labelKey: 'settings.nav.analytics' as const, icon: BarChart3 },
      { id: 'system-updates-settings', labelKey: 'settings.nav.updates' as const, icon: Download },
    ],
  },
]

export const SYNC_ICONS: Record<
  SyncStatus,
  { icon: typeof CheckCircle; className: string }
> = {
  idle: { icon: CheckCircle, className: 'text-muted-foreground' },
  saving: { icon: Loader2, className: 'text-yellow-400' },
  saved: { icon: CheckCircle, className: 'text-green-400' },
  error: { icon: AlertCircle, className: 'text-red-400' },
  offline: { icon: WifiOff, className: 'text-muted-foreground' },
}

function useSyncDisplay(syncStatus: SyncStatus) {
  const { t } = useTranslation()
  const sync = SYNC_ICONS[syncStatus]
  const label = ({
    idle: t('settings.syncStatus.synced'),
    saving: t('settings.syncStatus.saving'),
    saved: t('settings.syncStatus.savedToFile'),
    error: t('settings.syncStatus.saveFailed'),
    offline: t('settings.syncStatus.localOnly'),
  } satisfies Record<SyncStatus, string>)[syncStatus]
  return { sync, label }
}

interface SettingsSidebarProps {
  activeSection: string
  onNavClick: (id: string) => void
  syncStatus: SyncStatus
}

export function SettingsSidebar({
  activeSection,
  onNavClick,
  syncStatus,
}: SettingsSidebarProps) {
  const { t } = useTranslation()
  const { sync, label: syncLabel } = useSyncDisplay(syncStatus)
  const SyncIcon = sync.icon

  return (
    <nav className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto scroll-enhanced space-y-4">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h1
              data-testid="settings-title"
              className="text-xl font-bold text-foreground"
              data-qa="settings-header"
            >
              {t('settings.title')}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          <div className={cn('flex items-center gap-1.5 mt-2 text-xs', sync.className)}>
            <SyncIcon
              className={cn('w-3.5 h-3.5', syncStatus === 'saving' && 'animate-spin')}
            />
            <span>{syncLabel}</span>
          </div>
        </div>
        {SETTINGS_NAV.map((group) => (
          <div key={group.groupKey}>
            <h3 className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold mb-1 px-2">
              {t(group.groupKey)}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    data-settings-nav={item.id}
                    onClick={() => onNavClick(item.id)}
                    aria-label={t('actions.openSettingsSectionAria', {
                      section: t(item.labelKey),
                    })}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
                      isActive
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isActive ? 'text-purple-400' : 'text-muted-foreground',
                      )}
                    />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

interface MobileHeaderProps {
  syncStatus: SyncStatus
}

export function MobileHeader({ syncStatus }: MobileHeaderProps) {
  const { t } = useTranslation()
  const { sync, label: syncLabel } = useSyncDisplay(syncStatus)
  const SyncIcon = sync.icon

  return (
    <div className="block lg:hidden mb-6">
      <div className="flex items-center justify-between">
        <h1
          data-testid="settings-title"
          className="text-2xl font-bold text-foreground"
          data-qa="settings-header-mobile"
        >
          {t('settings.title')}
        </h1>
      </div>
      <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      <div className={cn('flex items-center gap-1.5 mt-2 text-xs', sync.className)}>
        <SyncIcon
          className={cn('w-3.5 h-3.5', syncStatus === 'saving' && 'animate-spin')}
        />
        <span>{syncLabel}</span>
      </div>
    </div>
  )
}

interface SectionGroupHeaderProps {
  labelKey: SettingsGroupKey
}

export function SectionGroupHeader({ labelKey }: SectionGroupHeaderProps) {
  const { t } = useTranslation()
  return (
    <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 px-1">
      {t(labelKey)}
    </h2>
  )
}

interface RestoredToastProps {
  show: boolean
}

export function RestoredToast({ show }: RestoredToastProps) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <div className="fixed top-20 right-4 z-toast bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-xs animate-in slide-in-from-right">
      {t('settings.restoredFromBackup')}
    </div>
  )
}
