/**
 * ImportTab component smoke tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
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
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
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
    let confirmSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      confirmSpy = vi.spyOn(window, 'confirm')
    })

    afterEach(() => {
      confirmSpy.mockRestore()
    })

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
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('uploads without confirmation when pasted YAML is whitespace only', () => {
      const handleFileUpload = vi.fn()
      const { container } = renderTab('   \n  ', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('prompts for confirmation when pasted YAML exists and proceeds on accept', () => {
      confirmSpy.mockReturnValue(true)
      const handleFileUpload = vi.fn()
      const { container } = renderTab('apiVersion: v1', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(handleFileUpload).toHaveBeenCalledTimes(1)
    })

    it('does NOT call the parent upload handler when the user cancels the confirm', () => {
      confirmSpy.mockReturnValue(false)
      const handleFileUpload = vi.fn()
      const { container } = renderTab('apiVersion: v1', handleFileUpload)
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, makeFileChangeEvent())
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(handleFileUpload).not.toHaveBeenCalled()
    })
  })
})
