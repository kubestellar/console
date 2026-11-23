import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ReservationFormModal } from '../ReservationFormModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useNamespaces: () => ({ namespaces: [], isLoading: false, error: null, refetch: vi.fn() }),
  createOrUpdateResourceQuota: vi.fn(),
  deleteResourceQuota: vi.fn(),
  COMMON_RESOURCE_TYPES: [],
}))

afterEach(cleanup)

describe('ReservationFormModal safety', () => {
  it('keeps edited fields on backdrop click and confirms before Escape discards them', () => {
    const onClose = vi.fn()
    render(
      <ReservationFormModal
        isOpen
        onClose={onClose}
        editingReservation={null}
        gpuClusters={[]}
        allNodes={[]}
        user={null}
        onSave={vi.fn()}
        onActivate={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const title = screen.getByPlaceholderText('gpuReservations.form.fields.titlePlaceholder')
    fireEvent.change(title, { target: { value: 'My reservation' } })
    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
    expect(title).toHaveValue('My reservation')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.keyDown(title, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    const confirmation = screen.getByRole('dialog', { name: 'common:common.discardUnsavedChanges' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'common:common.keepEditing' }))
    expect(title).toHaveValue('My reservation')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(title, { key: 'Escape' })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'common:common.discardUnsavedChanges' }))
      .getByRole('button', { name: 'common:common.discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
