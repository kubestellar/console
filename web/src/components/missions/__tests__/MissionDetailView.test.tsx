import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MissionExport } from '../../../lib/missions/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { MissionDetailView } from '../MissionDetailView'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const mission: MissionExport = {
  version: '1.0.0',
  title: 'Install Kyverno',
  description: 'Install a policy engine.',
  type: 'deploy',
  tags: ['security'],
  metadata: {
    sourceUrls: {
      repo: 'https://github.com/kubestellar/console',
    },
  },
  steps: [
    {
      title: 'Install',
      description: 'Run the install command.',
    },
  ],
}

describe('MissionDetailView', () => {
  it('shows a loading state while importing a mission', async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<void>()
    const onImport = vi.fn(() => deferred.promise)

    render(
      <MissionDetailView
        mission={mission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={onImport}
        onBack={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Import' })
    await user.click(button)

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(button.querySelector('.animate-spin')).not.toBeNull()

    deferred.resolve()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).not.toBeDisabled())
  })

  it('renders only http and https mission source URLs', () => {
    const unsafeMission: MissionExport = {
      ...mission,
      metadata: {
        sourceUrls: {
          repo: 'javascript:alert(1)',
          docs: 'data:text/html,<script>alert(1)</script>',
          helm: 'https://charts.example.com',
          issue: 'http://example.com/issues/1',
        },
      },
    }

    render(
      <MissionDetailView
        mission={unsafeMission}
        rawContent={null}
        showRaw={false}
        onToggleRaw={vi.fn()}
        onImport={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(screen.queryByRole('link', { name: 'missions.detail.links.repository' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'missions.detail.links.documentation' })).toBeNull()
    expect(screen.getByRole('link', { name: 'missions.detail.links.helmChart' })).toHaveAttribute('href', 'https://charts.example.com')
    expect(screen.getByRole('link', { name: 'missions.detail.links.issue' })).toHaveAttribute('href', 'http://example.com/issues/1')
  })
})
