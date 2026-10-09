// Card width options (in grid columns out of 12)
export const WIDTH_OPTIONS = [
  { value: 3, labelKey: 'cardWrapper.resizeSmall' as const, descKey: 'cardWrapper.resizeSmallDesc' as const },
  { value: 4, labelKey: 'cardWrapper.resizeMedium' as const, descKey: 'cardWrapper.resizeMediumDesc' as const },
  { value: 6, labelKey: 'cardWrapper.resizeLarge' as const, descKey: 'cardWrapper.resizeLargeDesc' as const },
  { value: 8, labelKey: 'cardWrapper.resizeWide' as const, descKey: 'cardWrapper.resizeWideDesc' as const },
  { value: 12, labelKey: 'cardWrapper.resizeFull' as const, descKey: 'cardWrapper.resizeFullDesc' as const },
]

// Card height options (in grid row spans)
export const HEIGHT_OPTIONS = [
  { value: 2, labelKey: 'cardWrapper.heightDefault' as const, descKey: 'cardWrapper.heightDefaultDesc' as const },
  { value: 3, labelKey: 'cardWrapper.heightTall' as const, descKey: 'cardWrapper.heightTallDesc' as const },
  { value: 4, labelKey: 'cardWrapper.heightExtraTall' as const, descKey: 'cardWrapper.heightExtraTallDesc' as const },
  { value: 6, labelKey: 'cardWrapper.heightMaximum' as const, descKey: 'cardWrapper.heightMaximumDesc' as const },
]

/** Approximate height of the card action menu (px) */
export const MENU_APPROX_HEIGHT = 300
/** Width of the card action menu (w-48 = 192px) */
export const MENU_WIDTH_PX = 192
/** Viewport edge padding (px) */
export const VIEWPORT_PADDING = 8
/** Submenu width — matches w-36 tailwind class (9rem = 144px). */
export const SUBMENU_WIDTH_PX = 144
/** Right-edge margin before flipping submenu to the left side. */
export const SUBMENU_EDGE_MARGIN_PX = 20
export const MENU_ITEM_SELECTOR = 'button[role="menuitem"]:not([disabled])'

/** Compute a safe position for the menu relative to an anchor element. */
export function computeMenuPosition(anchorRect: DOMRect): { top: number; right: number } {
  let top = anchorRect.bottom + 4
  let right = window.innerWidth - anchorRect.right

  if (top + MENU_APPROX_HEIGHT > window.innerHeight - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, anchorRect.top - MENU_APPROX_HEIGHT - 4)
  }
  if (right < VIEWPORT_PADDING) {
    right = VIEWPORT_PADDING
  }
  const leftEdge = window.innerWidth - right - MENU_WIDTH_PX
  if (leftEdge < VIEWPORT_PADDING) {
    right = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_PADDING
  }
  return { top, right }
}

