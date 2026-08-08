import React from 'react'
/**
 * UpdateSettingsForm Component Tests
 * Covers user-facing state transitions for the system updates settings panel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateSettingsForm } from '../UpdateSettingsForm'
import type { UpdateSettingsState } from '../useUpdateSettingsState'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('lucide-react', () => ({
  Download: () => <svg data-testid="icon-download" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  AlertTriangle: () => <svg data-testid="icon-alert" />,
}))

vi.mock('../UpdateProgressBanners', () => ({
  UpdateProgressBanners: () => <div data-testid="update-progress-banners" />,
}))

vi.mock('../UpdateVersionInfo', () => ({
  UpdateVersionInfo: () => <div data-testid="update-version-info" />,
}))

vi.mock('../UpdateCommitList', () => ({
  UpdateCommitList: () => <div data-testid="update-commit-list" />,
}))

vi.mock('../UpdateReleaseNotes', () => ({
  UpdateReleaseNotes: () => <div data-testid="update-release-notes" />,
}))

vi.mock('../UpdateHowToSection', () => ({
  UpdateHowToSection: () => <div data-testid="update-how-to-section" />,
}))

vi.mock('../UpdateSettingsForm.fields', () => ({
  UpdateChannelSection: () => <div data-testid="update-channel-section" />,
  UpdateDevChannelDetails: () => <div data-testid="update-dev-channel-details" />,
  UpdateInstallBanners: () => <div data-testid="update-install-banners" />,
  UpdateSelfUpgradePanel: () => <div data-testid="update-self-upgrade-panel" />,
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}))

function makeState(overrides: Partial<UpdateSettingsState> = {}): UpdateSettingsState {
  return {
    t: (k: string) => k,
    currentVersion: '1.0.0',
    commitHash: 'abc123',
    latestRelease: null,
    hasUpdate: false,
    isChecking: false,
    error: null,
    agentConnected: false,
    recentCommits: [],
    latestMainSHA: null,
    updateProgress: null,
    stepHistory: [],
    autoUpdateStatus: null,
    shasMatch: true,
    shortSHA: 'abc',
    currentSHA: 'abc123',
    latestSHA: null,
    releaseNotes: null,
    copiedCommand: null,
    triggerState: 'idle',
    triggerError: null,
    cancelState: 'idle',
    cancelError: null,
    countdown: null,
    isVisuallySpinning: false,
    helmCommand: 'helm upgrade ...',
    brewCommand: 'brew upgrade ...',
    installMethod: 'binary',
    isDeveloperChannel: false,
    isHelmInstall: false,
    isUpdating: false,
    canCancel: false,
    autoUpdateEnabled: false,
    formatLastChecked: () => 'Just now',
    dismissProgress: vi.fn(),
    handleCheckNow: vi.fn(),
    handleTriggerUpdate: vi.fn(),
    handleCopyCommand: vi.fn(),
    handleCancelUpdate: vi.fn(),
    handleRefreshToLoad: vi.fn(),
    handleReloadWindow: vi.fn(),
    ...overrides,
  } as unknown as UpdateSettingsState
}

describe('UpdateSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title and subtitle from translations', () => {
    render(<UpdateSettingsForm state={makeState()} />)
    expect(screen.getByText('settings.updates.title')).toBeInTheDocument()
    expect(screen.getByText('settings.updates.subtitle')).toBeInTheDocument()
  })

  it('shows binary install method badge when installMethod is binary', () => {
    render(<UpdateSettingsForm state={makeState({ installMethod: 'binary' })} />)
    expect(screen.getByText('settings.updates.binaryMode')).toBeInTheDocument()
  })

  it('shows helm install method badge when installMethod is helm', () => {
    render(<UpdateSettingsForm state={makeState({ installMethod: 'helm' })} />)
    expect(screen.getByText('settings.updates.helmMode')).toBeInTheDocument()
  })

  it('shows dev install method badge when installMethod is dev', () => {
    render(<UpdateSettingsForm state={makeState({ installMethod: 'dev' })} />)
    expect(screen.getByText('settings.updates.devMode')).toBeInTheDocument()
  })

  it('does not show install method badge when installMethod is unknown', () => {
    render(<UpdateSettingsForm state={makeState({ installMethod: 'unknown' })} />)
    expect(screen.queryByText('settings.updates.binaryMode')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.updates.helmMode')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.updates.devMode')).not.toBeInTheDocument()
  })

  it('calls handleCheckNow when Check Now button is clicked', () => {
    const handleCheckNow = vi.fn()
    render(<UpdateSettingsForm state={makeState({ handleCheckNow })} />)
    fireEvent.click(screen.getByText('settings.updates.checkNow'))
    expect(handleCheckNow).toHaveBeenCalledOnce()
  })

  it('disables Check Now button when isChecking is true', () => {
    render(<UpdateSettingsForm state={makeState({ isChecking: true })} />)
    expect(screen.getByText('settings.updates.checkNow').closest('button')).toBeDisabled()
  })

  it('disables Check Now button when isVisuallySpinning is true', () => {
    render(<UpdateSettingsForm state={makeState({ isVisuallySpinning: true })} />)
    expect(screen.getByText('settings.updates.checkNow').closest('button')).toBeDisabled()
  })

  it('shows Update Now button when hasUpdate, agentConnected, not helm, not updating', () => {
    render(
      <UpdateSettingsForm
        state={makeState({ hasUpdate: true, agentConnected: true, isHelmInstall: false, isUpdating: false })}
      />
    )
    expect(screen.getByText('settings.updates.updateNow')).toBeInTheDocument()
  })

  it('calls handleTriggerUpdate when Update Now button is clicked', () => {
    const handleTriggerUpdate = vi.fn()
    render(
      <UpdateSettingsForm
        state={makeState({
          hasUpdate: true,
          agentConnected: true,
          isHelmInstall: false,
          isUpdating: false,
          handleTriggerUpdate,
        })}
      />
    )
    fireEvent.click(screen.getByText('settings.updates.updateNow'))
    expect(handleTriggerUpdate).toHaveBeenCalledOnce()
  })

  it('hides Update Now button when agent is not connected', () => {
    render(
      <UpdateSettingsForm
        state={makeState({ hasUpdate: true, agentConnected: false, isHelmInstall: false, isUpdating: false })}
      />
    )
    expect(screen.queryByText('settings.updates.updateNow')).not.toBeInTheDocument()
  })

  it('hides Update Now button when using helm install', () => {
    render(
      <UpdateSettingsForm
        state={makeState({ hasUpdate: true, agentConnected: true, isHelmInstall: true, isUpdating: false })}
      />
    )
    expect(screen.queryByText('settings.updates.updateNow')).not.toBeInTheDocument()
  })

  it('hides Update Now button while update is in progress', () => {
    render(
      <UpdateSettingsForm
        state={makeState({ hasUpdate: true, agentConnected: true, isHelmInstall: false, isUpdating: true })}
      />
    )
    expect(screen.queryByText('settings.updates.updateNow')).not.toBeInTheDocument()
  })

  it('surfaces trigger error when triggerState is error', () => {
    render(
      <UpdateSettingsForm
        state={makeState({
          hasUpdate: true,
          agentConnected: true,
          isHelmInstall: false,
          isUpdating: false,
          triggerState: 'error',
          triggerError: 'Update failed: timeout',
        })}
      />
    )
    expect(screen.getByText('Update failed: timeout')).toBeInTheDocument()
  })

  it('does not show trigger error when triggerState is idle', () => {
    render(
      <UpdateSettingsForm
        state={makeState({
          hasUpdate: true,
          agentConnected: true,
          isHelmInstall: false,
          isUpdating: false,
          triggerState: 'idle',
          triggerError: null,
        })}
      />
    )
    expect(screen.queryByTestId('icon-alert')).not.toBeInTheDocument()
  })

  it('renders release notes when latestRelease is provided', () => {
    render(
      <UpdateSettingsForm
        state={makeState({ latestRelease: { tag_name: 'v2.0.0' } as UpdateSettingsState['latestRelease'] })}
      />
    )
    expect(screen.getByTestId('update-release-notes')).toBeInTheDocument()
  })

  it('does not render release notes when latestRelease is null', () => {
    render(<UpdateSettingsForm state={makeState({ latestRelease: null })} />)
    expect(screen.queryByTestId('update-release-notes')).not.toBeInTheDocument()
  })
})
