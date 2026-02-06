const SCROLL_HIGHLIGHT_MS = 2000
const SCROLL_POLL_INTERVAL_MS = 100
const SCROLL_POLL_MAX_MS = 3000

/**
 * Poll for a card element by data-card-type and scroll it into view
 * with a brief highlight ring.
 */
export function scrollToCard(cardType: string) {
  const startTime = Date.now()

  function poll() {
    const el = document.querySelector(`[data-card-type="${cardType}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-background')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-background')
      }, SCROLL_HIGHLIGHT_MS)
      return
    }
    if (Date.now() - startTime < SCROLL_POLL_MAX_MS) {
      setTimeout(poll, SCROLL_POLL_INTERVAL_MS)
    }
  }

  // Start polling after a frame so React can render the new route
  requestAnimationFrame(() => setTimeout(poll, SCROLL_POLL_INTERVAL_MS))
}
