import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BaseModal } from '../BaseModal'

interface ModalHarnessProps {
  onClose: () => void
}

function FormModalHarness({ onClose }: ModalHarnessProps) {
  return (
    <BaseModal isOpen={true} onClose={onClose} closeOnBackdrop={false} closeOnEscape={true}>
      <BaseModal.Header title="Edit settings" onClose={onClose} />
      <BaseModal.Content>
        <form>
          <label htmlFor="modal-name">Name</label>
          <input id="modal-name" name="name" />
        </form>
      </BaseModal.Content>
    </BaseModal>
  )
}

function SimpleModalHarness({ onClose }: ModalHarnessProps) {
  return (
    <BaseModal isOpen={true} onClose={onClose}>
      <BaseModal.Header title="Delete item" onClose={onClose} />
      <BaseModal.Content>
        <p>Are you sure?</p>
      </BaseModal.Content>
    </BaseModal>
  )
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('BaseModal safety behavior', () => {
  it('does not close a form modal on backdrop click when backdrop closing is disabled', () => {
    const onClose = vi.fn()

    render(<FormModalHarness onClose={onClose} />)

    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement | null
    expect(backdrop).not.toBeNull()

    if (!backdrop) {
      throw new Error('Expected modal backdrop to be rendered')
    }

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes a non-form modal on backdrop click by default', () => {
    const onClose = vi.fn()

    render(<SimpleModalHarness onClose={onClose} />)

    const backdrop = document.body.querySelector('.fixed.inset-0') as HTMLElement | null
    expect(backdrop).not.toBeNull()

    if (!backdrop) {
      throw new Error('Expected modal backdrop to be rendered')
    }

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('still closes a form modal with Escape even when backdrop closing is disabled', () => {
    const onClose = vi.fn()

    render(<FormModalHarness onClose={onClose} />)

    const input = screen.getByLabelText('Name')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
