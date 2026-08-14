import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GitHubActivityItems } from '../GitHubActivityItems'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('GitHubActivityItems', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <GitHubActivityItems
        items={[]}
        onItemClick={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders with sample items', () => {
    const items = [
      {
        id: '1',
        type: 'push' as const,
        repo: 'test/repo',
        timestamp: new Date().toISOString(),
        actor: 'testuser',
      },
    ]
    const { container } = render(
      <GitHubActivityItems
        items={items}
        onItemClick={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})
