import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { KubectlYAMLEditorPanel } from '../KubectlYAMLEditorPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('KubectlYAMLEditorPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <KubectlYAMLEditorPanel
        isOpen={true}
        onClose={vi.fn()}
        yaml=""
        onApply={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
