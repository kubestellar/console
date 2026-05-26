import { useCallback, useId, useRef, type KeyboardEvent } from 'react'
import { moveFocusByKey } from '../lib/a11y/rovingFocus'

const DEFAULT_NAV_SELECTOR = 'button:not([disabled]), [role="option"]:not([disabled]), [role="menuitem"]:not([disabled]), [role="tab"]:not([disabled])'
const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Spacebar'])

type NavigationOrientation = 'horizontal' | 'vertical' | 'both'

interface FocusTargetOptions {
  preferredSelector?: string
  fallbackSelector?: string
}

interface UseKeyboardNavOptions {
  selector?: string
  orientation?: NavigationOrientation
  onEscape?: () => void
}

function getFocusableItems(container: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(selector))
    .filter((item) => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true')
}

export function useKeyboardNav({
  selector = DEFAULT_NAV_SELECTOR,
  orientation = 'vertical',
  onEscape,
}: UseKeyboardNavOptions = {}) {
  const containerRef = useRef<HTMLElement | null>(null)

  const focusMatchingItem = useCallback(({ preferredSelector, fallbackSelector = selector }: FocusTargetOptions = {}) => {
    const container = containerRef.current
    if (!container) return null

    const preferred = preferredSelector
      ? container.querySelector<HTMLElement>(preferredSelector)
      : null

    if (preferred && !preferred.hasAttribute('disabled') && preferred.getAttribute('aria-disabled') !== 'true') {
      preferred.focus()
      return preferred
    }

    const fallback = getFocusableItems(container, fallbackSelector)[0] ?? null
    fallback?.focus()
    return fallback
  }, [selector])

  const focusLastItem = useCallback((fallbackSelector = selector) => {
    const container = containerRef.current
    if (!container) return null

    const items = getFocusableItems(container, fallbackSelector)
    const lastItem = items[items.length - 1] ?? null
    lastItem?.focus()
    return lastItem
  }, [selector])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const container = containerRef.current
    if (!container) return

    if (event.key === 'Escape') {
      event.preventDefault()
      onEscape?.()
      return
    }

    if (ACTIVATION_KEYS.has(event.key)) {
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
        event.preventDefault()
        activeElement.click()
      }
      return
    }

    moveFocusByKey(event, { selector, orientation })
  }, [onEscape, orientation, selector])

  return {
    containerRef,
    focusMatchingItem,
    focusLastItem,
    handleKeyDown,
  }
}

interface UseTabKeyboardNavOptions<T extends string> {
  tabs: readonly T[]
  activeTab: T
  onChange: (tab: T) => void
}

export function useTabKeyboardNav<T extends string>({ tabs, activeTab, onChange }: UseTabKeyboardNavOptions<T>) {
  const baseId = useId()

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const pressedKey = event.key

    // Handle arrow key focus movement via rovingFocus
    moveFocusByKey(event, { selector: '[role="tab"]:not([disabled])', orientation: 'horizontal' })

    if (pressedKey === 'ArrowLeft' || pressedKey === 'ArrowRight' || pressedKey === 'Home' || pressedKey === 'End') {
      if (!event.defaultPrevented) return

      const nextTab = document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.tabId as T | undefined
        : undefined

      if (nextTab && tabs.includes(nextTab)) {
        onChange(nextTab)
      }
      return
    }

    if (!ACTIVATION_KEYS.has(pressedKey)) return

    const currentTab = document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.tabId as T | undefined
      : undefined

    if (currentTab && tabs.includes(currentTab)) {
      onChange(currentTab)
    }
  }, [onChange, tabs])

  const getTabProps = useCallback((tab: T) => ({
    id: `${baseId}-tab-${tab}`,
    role: 'tab' as const,
    tabIndex: activeTab === tab ? 0 : -1,
    'data-tab-id': tab,
    'aria-selected': activeTab === tab,
    'aria-controls': `${baseId}-panel-${tab}`,
    onClick: () => onChange(tab),
  }), [activeTab, baseId, onChange])

  const getTabPanelProps = useCallback((tab: T) => ({
    id: `${baseId}-panel-${tab}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `${baseId}-tab-${tab}`,
    tabIndex: 0,
  }), [baseId])

  return {
    tabListProps: {
      role: 'tablist' as const,
      'aria-orientation': 'horizontal' as const,
      onKeyDown: handleTabKeyDown,
    },
    getTabProps,
    getTabPanelProps,
  }
}
