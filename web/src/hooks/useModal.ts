import { useState, useCallback } from 'react'

export interface UseModalResult {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  /** Escape hatch for components that accept a raw setter (e.g. `setIsOpen`). */
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Centralizes the `useState(false)` + open/close/toggle pattern used for
 * modal and drawer visibility across dashboard cards and drilldowns.
 * Auto-QA (#8815) flagged 1193 ad-hoc `useState(false)` call sites for
 * modal-ish flags; this hook is the migration target.
 *
 *   const modal = useModal()
 *   <button onClick={modal.open}>Open</button>
 *   {modal.isOpen && <Modal onClose={modal.close}>...</Modal>}
 */
export function useModal(initialOpen = false): UseModalResult {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  return { isOpen, open, close, toggle, setIsOpen }
}
