import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NamespaceQuotasDeleteModal } from '../NamespaceQuotasDeleteModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('NamespaceQuotasDeleteModal', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <NamespaceQuotasDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        quotaName="test-quota"
      />
    )
    expect(container).toBeTruthy()
  })
})
