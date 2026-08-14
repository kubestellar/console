import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NamespaceQuotasList } from '../NamespaceQuotasList'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('NamespaceQuotasList', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <NamespaceQuotasList
        quotas={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
