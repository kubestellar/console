import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Box } from 'lucide-react'
import { ListResourceRow } from '../NamespaceResources.parts'
import { SimpleResourceRow } from '../SimpleResourceRow'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('namespace resource rows keyboard navigation', () => {
  it('opens list and tree rows with Enter and Space', async () => {
    const user = userEvent.setup()
    const onListClick = vi.fn()
    const onTreeClick = vi.fn()
    render(
      <>
        <ListResourceRow resource={{ kind: 'Pod', name: 'api-7f9c', statusColor: 'green', status: 'Running' }} onClick={onListClick} />
        <SimpleResourceRow icon={<Box />} name="db-svc" primaryText="ClusterIP" onClick={onTreeClick} />
      </>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: /api-7f9c/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onListClick).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(screen.getByRole('button', { name: /db-svc/ })).toHaveFocus()
    await user.keyboard('[Space]')
    expect(onTreeClick).toHaveBeenCalledTimes(1)
  })
})
