/**
 * ImportTab component smoke tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../../lib/modals/ConfirmDialog', () => ({
  ConfirmDialog: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel,
  }: {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
  }) => isOpen ? (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <span>{message}</span>
      <button onClick={onClose}>cancel</button>
      <button onClick={onConfirm}>{confirmLabel ?? 'Confirm'}</button>
    </div>
  ) : null,
}))

import { ImportTab } from '../ImportTab'

describe('ImportTab', () => {
  it('renders without crashing', () => {
    const fileInputRef = createRef<HTMLInputElement>()
    const { container } = render(
      <ImportTab
        kubeconfigYaml=""
        setKubeconfigYaml={vi.fn()}
        importState="idle"
        setImportState={vi.fn()}
        previewContexts={[]}
        setPreviewContexts={vi.fn()}
        errorMessage=""
        setErrorMessage={vi.fn()}
        importedCount={0}
        fileInputRef={fileInputRef as React.RefObject<HTMLInputElement | null>}
        handleFileUpload={vi.fn()}
        handlePreview={vi.fn()}
        handleImport={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  describe('upload overwrite confirmation (#8917)', () => {
    // Test fixture: a minimal File that satisfies the onChange handler contract.
    // We don't actually exercise FileReader here — that logic lives in the parent
    // (AddClusterDialog.handleFileUpload). We only verify the confirmation gate.
    const makeFileChangeEvent = (): React.ChangeEvent<HTMLInputElement> => {
      const file = new File(['apiVersion: v1'], 'kubeconfig.yaml', { type: 'text/yaml' })
      return {
        target: { files: [file] as unknown as FileList, value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>
    }

    const renderTab = (
      kubeconfigYaml: string,
      handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
    ) => {
      const fileInputRef = createRef<HTMLInputElement>()
      return render(
        <ImportTab
          kubeconfigYaml={kubeconfigYaml}
          setKubeconfigYaml={vi.fn()}
          importState="idle"
          setImportState={vi.fn()}
          previewContexts={[]}
          setPreviewContexts={vi.fn()}
          errorMessage=""
          setErrorMessage={vi.fn()}
          importedCount={0}
          fileInputRef={fileInputRef as React.RefObject<HTMLInputElement | null>}
          handleFileUpload={handleFileUpload}
          handlePreview={vi.fn()}
          handleImport={vi.fn()}
        />,
      )
    }

    it('uploads without confirmation when pasted YAML is empty', () => {
      const handleFileUpload = vi.fn()
      const { container } = renderTab('', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('uploads without confirmation when pasted YAML is whitespace only', () => {
      const handleFileUpload = vi.fn()
      const { container } = renderTab('   \n  ', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('opens the confirm dialog when pasted YAML exists and proceeds on accept', () => {
      const handleFileUpload = vi.fn()
      const { container } = renderTab('apiVersion: v1', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'actions.replace' }))
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('does NOT call the parent upload handler when the user cancels the dialog', () => {
      const handleFileUpload = vi.fn()
      const { container } = renderTab('apiVersion: v1', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
      expect(handleFileUpload).not.toHaveBeenCalled()
    })
  })
})
