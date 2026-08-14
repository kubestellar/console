import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { KubectlHistoryPanel } from '../KubectlHistoryPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('KubectlHistoryPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <KubectlHistoryPanel
        isOpen={true}
        onClose={vi.fn()}
        history={[]}
        onSelectCommand={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
