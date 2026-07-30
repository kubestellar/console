import React from 'react'
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
})
