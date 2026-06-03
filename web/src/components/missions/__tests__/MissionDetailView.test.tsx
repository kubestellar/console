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
  steps: [
    {
      title: 'Install',
      description: 'Run the install command.',
    },
  ],
}

function renderMissionDetailView(missionProp: MissionExport = mission) {
  render(
    <MissionDetailView
      mission={missionProp}
      rawContent={null}
      showRaw={false}
      onToggleRaw={vi.fn()}
      onImport={vi.fn()}
      onBack={vi.fn()}
    />,
  )
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
    const clickPromise = user.click(button)

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled()
    expect(button.querySelector('.animate-spin')).not.toBeNull()

    deferred.resolve()
    await clickPromise

    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).not.toBeDisabled())
  })

  it('sanitizes unsafe sourceUrl links before rendering mission metadata', () => {
    renderMissionDetailView({
      ...mission,
      metadata: {
        sourceUrls: {
          repo: 'javascript:alert(1)',
          docs: ' data:text/html,<script>alert(1)</script> ',
          helm: 'JavaScript:alert(1)',
          issue: '\n javascript:alert(1)',
          pr: 'java%0ascript:alert(1)',
        },
      },
    })

    expect(screen.getByRole('link', { name: 'missions.detail.links.repository' })).toHaveAttribute('href', 'about:blank')
    expect(screen.getByRole('link', { name: 'missions.detail.links.documentation' })).toHaveAttribute('href', 'about:blank')
    expect(screen.getByRole('link', { name: 'missions.detail.links.helmChart' })).toHaveAttribute('href', 'about:blank')
    expect(screen.getByRole('link', { name: 'missions.detail.links.issue' })).toHaveAttribute('href', 'about:blank')
    expect(screen.getByRole('link', { name: 'missions.detail.links.pullRequest' })).toHaveAttribute('href', 'about:blank')
  })

  it('preserves valid http and https sourceUrl links', () => {
    renderMissionDetailView({
      ...mission,
      metadata: {
        sourceUrls: {
          repo: 'https://example.com/repository',
          docs: 'http://example.com/docs',
          helm: 'https://charts.example.com/kyverno',
          issue: 'https://github.com/kubestellar/console/issues/16532',
          pr: 'http://github.com/kubestellar/console/pull/16610',
        },
      },
    })

    expect(screen.getByRole('link', { name: 'missions.detail.links.repository' })).toHaveAttribute('href', 'https://example.com/repository')
    expect(screen.getByRole('link', { name: 'missions.detail.links.documentation' })).toHaveAttribute('href', 'http://example.com/docs')
    expect(screen.getByRole('link', { name: 'missions.detail.links.helmChart' })).toHaveAttribute('href', 'https://charts.example.com/kyverno')
    expect(screen.getByRole('link', { name: 'missions.detail.links.issue' })).toHaveAttribute('href', 'https://github.com/kubestellar/console/issues/16532')
    expect(screen.getByRole('link', { name: 'missions.detail.links.pullRequest' })).toHaveAttribute('href', 'http://github.com/kubestellar/console/pull/16610')
  })
})
