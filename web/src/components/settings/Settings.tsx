import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useAccessibility } from '../../hooks/useAccessibility'
import { useVersionCheck } from '../../hooks/useVersionCheck'
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
} from './sections'

export function Settings() {
  const { user, refreshUser } = useAuth()
  const { themeId, setTheme, themes, currentTheme } = useTheme()
  const { usage, updateSettings, resetUsage } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh } = useLocalAgent()
  const { colorBlindMode, setColorBlindMode, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useAccessibility()
  const { forceCheck: forceVersionCheck } = useVersionCheck()

  return (
    <div data-testid="settings-page" className="pt-16 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 data-testid="settings-title" className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Configure console preferences and AI usage</p>
      </div>

      <div className="space-y-6">
        {/* AI Usage Mode */}
        <AISettingsSection mode={mode} setMode={setMode} description={description} />

        {/* Profile */}
        <ProfileSection
          initialEmail={user?.email || ''}
          initialSlackId={user?.slackId || ''}
          refreshUser={refreshUser}
        />

        {/* Local Agent */}
        <AgentSection isConnected={isConnected} health={health} refresh={refresh} />

        {/* GitHub Integration */}
        <GitHubTokenSection forceVersionCheck={forceVersionCheck} />

        {/* System Updates */}
        <UpdateSettings />

        {/* API Keys */}
        <APIKeysSection />

        {/* Token Usage */}
        <TokenUsageSection usage={usage} updateSettings={updateSettings} resetUsage={resetUsage} />

        {/* Appearance - Theme Selection */}
        <ThemeSection
          themeId={themeId}
          setTheme={setTheme}
          themes={themes}
          currentTheme={currentTheme}
        />

        {/* Accessibility */}
        <AccessibilitySection
          colorBlindMode={colorBlindMode}
          setColorBlindMode={setColorBlindMode}
          reduceMotion={reduceMotion}
          setReduceMotion={setReduceMotion}
          highContrast={highContrast}
          setHighContrast={setHighContrast}
        />

        {/* Permissions Checker */}
        <PermissionsSection />
      </div>
    </div>
  )
}
