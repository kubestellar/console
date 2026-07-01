import { FOCUS_OUTLINE_WIDTH_PX, FOCUS_OUTLINE_OFFSET_PX } from './constants'

export interface SkipLink {
  id: string
  label: string
  targetId: string
}

// Default skip links for the application layout
export const DEFAULT_SKIP_LINKS: readonly SkipLink[] = [
  { id: 'skip-to-main', label: 'Skip to main content', targetId: 'main-content' },
  { id: 'skip-to-nav', label: 'Skip to navigation', targetId: 'main-navigation' },
  { id: 'skip-to-search', label: 'Skip to search', targetId: 'search-input' },
] as const

export function focusTarget(targetId: string): boolean {
  const target = document.getElementById(targetId)
  if (!target) {
    return false
  }

  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1')
  }

  target.focus({ preventScroll: false })
  return true
}

// CSS for skip links — visually hidden until focused (WCAG 2.4.1)
export const SKIP_LINK_STYLES = {
  base: {
    position: 'absolute' as const,
    left: '-9999px',
    top: 'auto',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    zIndex: -1,
  },
  focused: {
    position: 'fixed' as const,
    left: '50%',
    top: '8px',
    transform: 'translateX(-50%)',
    width: 'auto',
    height: 'auto',
    overflow: 'visible',
    zIndex: 9999,
    padding: '8px 16px',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: '6px',
    outline: `${FOCUS_OUTLINE_WIDTH_PX}px solid #3b82f6`,
    outlineOffset: `${FOCUS_OUTLINE_OFFSET_PX}px`,
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
} as const

export function getSkipLinkClassName(): string {
  return 'skip-link'
}

// Inject skip link CSS into document head (idempotent)
const STYLE_ELEMENT_ID = 'a11y-skip-link-styles'

export function injectSkipLinkStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = `
    .skip-link {
      position: absolute;
      left: -9999px;
      top: auto;
      width: 1px;
      height: 1px;
      overflow: hidden;
      z-index: -1;
    }
    .skip-link:focus {
      position: fixed;
      left: 50%;
      top: 8px;
      transform: translateX(-50%);
      width: auto;
      height: auto;
      overflow: visible;
      z-index: 9999;
      padding: 8px 16px;
      background-color: #1e293b;
      color: #f8fafc;
      border-radius: 6px;
      outline: ${FOCUS_OUTLINE_WIDTH_PX}px solid #3b82f6;
      outline-offset: ${FOCUS_OUTLINE_OFFSET_PX}px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
  `
  document.head.appendChild(style)
}
