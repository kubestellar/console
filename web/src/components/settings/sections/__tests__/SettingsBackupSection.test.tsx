import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { TOAST_DISMISS_MS } from '../../../../lib/constants/network'
import { SettingsBackupSection } from '../SettingsBackupSection'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../../lib/constants/network', () => ({
  TOAST_DISMISS_MS: 1000,
}))

describe('SettingsBackupSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the file path and calls export when the export button is clicked', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined)

    render(
      <SettingsBackupSection
        syncStatus="saved"
        lastSaved={new Date()}
        filePath="/home/dev/.kubestellar/settings.json"
        onExport={onExport}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByText('/home/dev/.kubestellar/settings.json')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'settings.backup.exportBackup' }))

    await waitFor(() => {
      expect(onExport).toHaveBeenCalledTimes(1)
    })
  })

  it('imports a backup file and clears the success message after the timeout', async () => {
    vi.useFakeTimers()
    const onImport = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <SettingsBackupSection
        syncStatus="saved"
        lastSaved={new Date()}
        filePath="/settings.json"
        onExport={vi.fn()}
        onImport={onImport}
      />
    )

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['{}'], 'settings.json', { type: 'application/json' })

    fireEvent.change(fileInput, {
      target: { files: [file] },
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(onImport).toHaveBeenCalledWith(file)
    expect(screen.getByText('settings.backup.importSuccess')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TOAST_DISMISS_MS)
    })

    expect(screen.queryByText('settings.backup.importSuccess')).not.toBeInTheDocument()
  })

  it('disables import and export while offline', () => {
    render(
      <SettingsBackupSection
        syncStatus="offline"
        lastSaved={null}
        filePath="/settings.json"
        onExport={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'settings.backup.exportBackup' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'settings.backup.importBackup' })).toBeDisabled()
  })
})
