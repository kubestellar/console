import { useSettingsTabs } from './useSettingsTabs'
import { UpdateSettings } from './UpdateSettings'
import {
  AISettingsSection,
  ProfileSection,
  AgentSection,
  GitHubTokenSection,
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
import {
  SettingsSidebar,
  SectionGroupHeader,
  RestoredToast,
  MobileHeader,
} from './Settings.parts'

export function Settings() {
  const {
    activeSection,
    showRestoredToast,
    contentRef,
    handleNavClick,
    user,
    refreshUser,
    isUserLoading,
    themeId,
    setTheme,
    themes,
    currentTheme,
    usage,
    updateTokenSettings,
    resetUsage,
    isDemoData,
    mode,
    setMode,
    description,
    health,
    isConnected,
    refreshAgent,
    isInClusterMode,
    colorBlindMode,
    setColorBlindMode,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    forceVersionCheck,
    predictionSettings,
    updatePredictionSettings,
    resetPredictionSettings,
    syncStatus,
    lastSaved,
    filePath,
    exportSettings,
    importSettings,
  } = useSettingsTabs()

  return (
    <div
      data-testid="settings-page"
      className="pt-16 max-w-6xl mx-auto flex flex-col lg:flex-row gap-6"
    >
      <RestoredToast show={showRestoredToast} />
      <SettingsSidebar
        activeSection={activeSection}
        onNavClick={handleNavClick}
        syncStatus={syncStatus}
      />
      <div ref={contentRef} className="flex-1 min-w-0">
        <MobileHeader syncStatus={syncStatus} />

        {/* AI & Intelligence Group */}
        <div className="mb-8">
          <SectionGroupHeader labelKey="settings.groups.aiIntelligence" />
          <div className="space-y-6">
            <AISettingsSection mode={mode} setMode={setMode} description={description} />
            <PredictionSettingsSection
              settings={predictionSettings}
              updateSettings={updatePredictionSettings}
              resetSettings={resetPredictionSettings}
            />
            <AgentSection
              isConnected={isConnected}
              isInClusterMode={isInClusterMode}
              health={health}
              refresh={refreshAgent}
            />
            <TokenUsageSection
              usage={usage}
              updateSettings={updateTokenSettings}
              resetUsage={resetUsage}
              isDemoData={isDemoData}
            />
          </div>
        </div>

        {/* Integrations Group */}
        <div className="mb-8">
          <SectionGroupHeader labelKey="settings.groups.integrations" />
          <div className="space-y-6">
            <GitHubTokenSection forceVersionCheck={forceVersionCheck} />
            <WidgetSettingsSection />
            <PersistenceSection />
          </div>
        </div>

        {/* User & Alerts Group */}
        <div className="mb-8">
          <SectionGroupHeader labelKey="settings.groups.userAlerts" />
          <div className="space-y-6">
            <ProfileSection
              initialEmail={user?.email ?? ''}
              initialSlackId={user?.slack_id ?? ''}
              githubLogin={user?.github_login ?? ''}
              refreshUser={refreshUser}
              isLoading={isUserLoading}
            />
            <NotificationSettingsSection />
          </div>
        </div>

        {/* Appearance Group */}
        <div className="mb-8">
          <SectionGroupHeader labelKey="settings.groups.appearance" />
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
          <SectionGroupHeader labelKey="settings.groups.utilities" />
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
