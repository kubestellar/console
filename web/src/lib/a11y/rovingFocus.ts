type KeyboardNavigationEvent = {
  key: string
  currentTarget: EventTarget & HTMLElement
  preventDefault: () => void
}

interface MoveFocusOptions {
  selector?: string
  orientation?: 'horizontal' | 'vertical' | 'both'
  loop?: boolean
}

const DEFAULT_SELECTOR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export function moveFocusByKey(
  event: KeyboardNavigationEvent,
  { selector = DEFAULT_SELECTOR, orientation = 'both', loop = true }: MoveFocusOptions = {},
): HTMLElement | null {
  const horizontal = orientation === 'horizontal' || orientation === 'both'
  const vertical = orientation === 'vertical' || orientation === 'both'
  const isForward = (horizontal && event.key === 'ArrowRight') || (vertical && event.key === 'ArrowDown')
  const isBackward = (horizontal && event.key === 'ArrowLeft') || (vertical && event.key === 'ArrowUp')
  const isBoundary = event.key === 'Home' || event.key === 'End'

  if (!isForward && !isBackward && !isBoundary) {
    return null
  }

  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector))
    .filter((item) => !item.hasAttribute('disabled'))

  if (items.length === 0) {
    return null
  }

  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLElement)
  let nextIndex = currentIndex >= 0 ? currentIndex : 0

  if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = items.length - 1
  } else {
    const delta = isForward ? 1 : -1
    nextIndex += delta
    if (loop) {
      nextIndex = (nextIndex + items.length) % items.length
    } else {
      nextIndex = Math.min(items.length - 1, Math.max(0, nextIndex))
    }
  }

  const nextItem = items[nextIndex] ?? null
  nextItem?.focus()
  return nextItem
}
