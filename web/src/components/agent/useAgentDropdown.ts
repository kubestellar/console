import { useRef, useState, useEffect } from 'react'
import { useModalState } from '../../lib/modals'

/**
 * Encapsulates dropdown open/close mechanics, positioning, and keyboard
 * interactions for AgentConfigForm. Extracted from AgentConfigForm.tsx to
 * keep that file under the 10-hook call limit.
 */
export function useAgentDropdown(isDemoMode: boolean) {
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeDropdown])

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const DROPDOWN_GAP_PX = 4
      setDropdownPos({
        top: rect.bottom + DROPDOWN_GAP_PX,
        right: window.innerWidth - rect.right,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, { capture: true })
    }
  }, [isOpen])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDropdown()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, closeDropdown])

  useEffect(() => {
    if (isDemoMode) closeDropdown()
  }, [isDemoMode, closeDropdown])

  return { isOpen, closeDropdown, toggleDropdown, dropdownRef, buttonRef, panelRef, dropdownPos }
}
