import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NamespaceQuotasModal } from '../NamespaceQuotasModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('NamespaceQuotasModal', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <NamespaceQuotasModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        cluster=""
        namespace=""
      />
    )
    expect(container).toBeTruthy()
  })
})
