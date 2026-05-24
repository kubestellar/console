/**
 * CardActionMenu — comprehensive Vitest + RTL tests (#15539).
 *
 * Covers: width/height submenus, callbacks, keyboard navigation,
 * card-menu-open CustomEvent coordination, outside-click dismiss,
 * and the existing Escape-key focus-restore test.
 *
 * Incorporates all improvements recommended in Copilot review.
 *
 * Run from web/:  npx vitest run src/components/cards/card-wrapper/CardActionMenu.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CardActionMenu } from './CardActionMenu'
import { copyToClipboard } from '../../../lib/clipboard'

// ---------------------------------------------------------------------------
// Mocks — same pattern as the original single test
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/widgets/widgetRegistry', () => ({
  isCardExportable: () => false,
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => null,
}))

// Get a strictly-typed reference to the mocked copyToClipboard function
const mockedCopyToClipboard = vi.mocked(copyToClipboard)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_ID = 'pod-health'
const CARD_TYPE = 'pod_health'
const TRIGGER_LABEL = 'cardWrapper.cardMenuTooltip'
const MENU_LABEL = 'cardWrapper.cardMenuTooltip'

// Width option values from the source
const WIDTH_SMALL = 3
const WIDTH_LARGE = 6
const WIDTH_FULL = 12

// Height option values from the source
const HEIGHT_DEFAULT = 2
const HEIGHT_TALL = 3
const HEIGHT_MAXIMUM = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default props for a fully-wired CardActionMenu. */
function defaultProps(overrides: Partial<{
  onWidthChange: ReturnType<typeof vi.fn>
  onHeightChange: ReturnType<typeof vi.fn>
  onConfigure: ReturnType<typeof vi.fn>
  onRemove: ReturnType<typeof vi.fn>
  onShowWidgetExport: ReturnType<typeof vi.fn>
  cardWidth: number
  cardHeight: number
}> = {}) {
  return {
    cardId: CARD_ID,
    cardType: CARD_TYPE,
    onConfigure: overrides.onConfigure ?? vi.fn(),
    onRemove: overrides.onRemove ?? vi.fn(),
    onShowWidgetExport: overrides.onShowWidgetExport ?? vi.fn(),
    onWidthChange: overrides.onWidthChange ?? vi.fn(),
    onHeightChange: overrides.onHeightChange ?? vi.fn(),
    cardWidth: overrides.cardWidth,
    cardHeight: overrides.cardHeight,
  }
}

/** Opens the main three-dot menu by clicking its trigger button. */
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
}

/** Query a menu item by its title attribute (most reliable for nested content). */
function getItemByTitle(title: string) {
  return screen.getByTitle(title)
}

/** Query all role="menuitem" buttons inside a given menu (by aria-label). */
function getSubMenuItems(menuLabel: string) {
  const menu = screen.getByRole('menu', { name: menuLabel })
  return within(menu).getAllByRole('menuitem')
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

// ===========================================================================
// Tests
// ===========================================================================

describe('CardActionMenu', () => {
  // -------------------------------------------------------------------------
  // Existing test — Escape key focus restore (preserved from original)
  // -------------------------------------------------------------------------
  describe('Escape key', () => {
    it('wires menu semantics and restores focus on Escape', () => {
      render(
        <CardActionMenu
          cardId={CARD_ID}
          cardType={CARD_TYPE}
          onConfigure={vi.fn()}
          onRemove={vi.fn()}
          onShowWidgetExport={vi.fn()}
        />,
      )

      const trigger = screen.getByRole('button', { name: TRIGGER_LABEL })
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(trigger)

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(trigger).toHaveAttribute('aria-controls', `card-action-menu-${CARD_ID}`)
      expect(screen.getByRole('menuitem', { name: /common:actions.configure/i })).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'Escape' })

      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Width submenu
  // -------------------------------------------------------------------------
  describe('width submenu', () => {
    it('opens width submenu and sets aria-expanded on the trigger', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const resizeBtn = getItemByTitle('cardWrapper.resizeTooltip')
      expect(resizeBtn).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(resizeBtn)

      expect(resizeBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeTooltip' })).toBeInTheDocument()
    })

    it('fires onWidthChange with the small value (3) and closes both menus', () => {
      const onWidthChange = vi.fn()
      render(<CardActionMenu {...defaultProps({ onWidthChange })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))

      // Width submenu items don't have title attributes — use within() on the submenu
      const widthOptions = getSubMenuItems('cardWrapper.resizeTooltip')
      // First option is "small" (value=3)
      fireEvent.click(widthOptions[0])

      expect(onWidthChange).toHaveBeenCalledTimes(1)
      expect(onWidthChange).toHaveBeenCalledWith(WIDTH_SMALL)

      // Both submenu and main menu should close
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })

    it('fires onWidthChange with the full-width value (12)', () => {
      const onWidthChange = vi.fn()
      render(<CardActionMenu {...defaultProps({ onWidthChange })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))

      const widthOptions = getSubMenuItems('cardWrapper.resizeTooltip')
      // Last option is "full" (value=12)
      fireEvent.click(widthOptions[widthOptions.length - 1])

      expect(onWidthChange).toHaveBeenCalledWith(WIDTH_FULL)
    })

    it('highlights the currently-selected width option with active styling', () => {
      render(<CardActionMenu {...defaultProps({ cardWidth: WIDTH_LARGE })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))

      const widthOptions = getSubMenuItems('cardWrapper.resizeTooltip')
      // WIDTH_LARGE = 6 is the 3rd option (index 2): [3, 4, 6, 8, 12]
      const activeOption = widthOptions[2]
      
      // Note: Component uses simple conditional class strings for layout.
      // Assert for core indicator class presence rather than the whole string.
      expect(activeOption.className).toContain('text-purple-400')

      // Another option (first = small) should NOT have active styling
      expect(widthOptions[0].className).not.toContain('text-purple-400')
    })
  })

  // -------------------------------------------------------------------------
  // Height submenu
  // -------------------------------------------------------------------------
  describe('height submenu', () => {
    it('opens height submenu and sets aria-expanded on the trigger', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const heightBtn = getItemByTitle('cardWrapper.resizeHeightTooltip')
      expect(heightBtn).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(heightBtn)

      expect(heightBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeHeightTooltip' })).toBeInTheDocument()
    })

    it('fires onHeightChange with the tall value (3) and closes both menus', () => {
      const onHeightChange = vi.fn()
      render(<CardActionMenu {...defaultProps({ onHeightChange })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeHeightTooltip'))

      const heightOptions = getSubMenuItems('cardWrapper.resizeHeightTooltip')
      // Second option is "tall" (value=3): [2, 3, 4, 6]
      fireEvent.click(heightOptions[1])

      expect(onHeightChange).toHaveBeenCalledTimes(1)
      expect(onHeightChange).toHaveBeenCalledWith(HEIGHT_TALL)

      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })

    it('fires onHeightChange with the maximum value (6)', () => {
      const onHeightChange = vi.fn()
      render(<CardActionMenu {...defaultProps({ onHeightChange })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeHeightTooltip'))

      const heightOptions = getSubMenuItems('cardWrapper.resizeHeightTooltip')
      // Last option is "maximum" (value=6)
      fireEvent.click(heightOptions[heightOptions.length - 1])

      expect(onHeightChange).toHaveBeenCalledWith(HEIGHT_MAXIMUM)
    })

    it('highlights the currently-selected height option with active styling', () => {
      render(<CardActionMenu {...defaultProps({ cardHeight: HEIGHT_DEFAULT })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.resizeHeightTooltip'))

      const heightOptions = getSubMenuItems('cardWrapper.resizeHeightTooltip')
      // HEIGHT_DEFAULT = 2 is the 1st option (index 0): [2, 3, 4, 6]
      expect(heightOptions[0].className).toContain('text-purple-400')

      // Tall option (index 1) should NOT have active styling
      expect(heightOptions[1].className).not.toContain('text-purple-400')
    })
  })

  // -------------------------------------------------------------------------
  // Width/height submenu mutual exclusion
  // -------------------------------------------------------------------------
  describe('submenu mutual exclusion', () => {
    it('opening width submenu closes the height submenu', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      // Open height submenu first
      fireEvent.click(getItemByTitle('cardWrapper.resizeHeightTooltip'))
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeHeightTooltip' })).toBeInTheDocument()

      // Now open width submenu — height should close
      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeTooltip' })).toBeInTheDocument()
      expect(screen.queryByRole('menu', { name: 'cardWrapper.resizeHeightTooltip' })).not.toBeInTheDocument()
    })

    it('opening height submenu closes the width submenu', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      // Open width submenu first
      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeTooltip' })).toBeInTheDocument()

      // Now open height submenu — width should close
      fireEvent.click(getItemByTitle('cardWrapper.resizeHeightTooltip'))
      expect(screen.getByRole('menu', { name: 'cardWrapper.resizeHeightTooltip' })).toBeInTheDocument()
      expect(screen.queryByRole('menu', { name: 'cardWrapper.resizeTooltip' })).not.toBeInTheDocument()
    })

    it('ArrowLeft closes the open width submenu', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      // Open the width submenu
      fireEvent.click(getItemByTitle('cardWrapper.resizeTooltip'))
      const widthSubMenu = screen.getByRole('menu', { name: 'cardWrapper.resizeTooltip' })
      expect(widthSubMenu).toBeInTheDocument()

      // Press ArrowLeft on the submenu
      fireEvent.keyDown(widthSubMenu, { key: 'ArrowLeft' })

      // The width submenu should close
      expect(screen.queryByRole('menu', { name: 'cardWrapper.resizeTooltip' })).not.toBeInTheDocument()
      // Main menu should still be open
      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Callbacks — Configure, Remove, Copy Link
  // -------------------------------------------------------------------------
  describe('callbacks', () => {
    it('clicking Configure fires onConfigure and closes the menu', () => {
      const onConfigure = vi.fn()
      render(<CardActionMenu {...defaultProps({ onConfigure })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.configureTooltip'))

      expect(onConfigure).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })

    it('clicking Remove fires onRemove and closes the menu', () => {
      const onRemove = vi.fn()
      render(<CardActionMenu {...defaultProps({ onRemove })} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.removeTooltip'))

      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })

    it('clicking Copy Link calls copyToClipboard with the expected URL', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      fireEvent.click(getItemByTitle('cardWrapper.copyLinkTooltip'))

      const expectedUrl = `${window.location.origin}${window.location.pathname}?card=${CARD_TYPE}`
      expect(mockedCopyToClipboard).toHaveBeenCalledTimes(1)
      expect(mockedCopyToClipboard).toHaveBeenCalledWith(expectedUrl)

      // Menu should close after copy
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Keyboard navigation
  //
  // Anchor keyboard navigation assertions to specific menu items rather than
  // hardcoded indices. This makes them highly resilient to presentational refactors.
  // -------------------------------------------------------------------------
  describe('keyboard navigation', () => {
    it('ArrowDown moves focus to the next menu item', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const configureItem = getItemByTitle('cardWrapper.configureTooltip')
      const copyLinkItem = getItemByTitle('cardWrapper.copyLinkTooltip')

      // Auto-focus defaults to first item (Configure)
      expect(configureItem).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'ArrowDown' })
      expect(copyLinkItem).toHaveFocus()
    })

    it('ArrowUp moves focus to the previous menu item', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const configureItem = getItemByTitle('cardWrapper.configureTooltip')
      const copyLinkItem = getItemByTitle('cardWrapper.copyLinkTooltip')
      const resizeItem = getItemByTitle('cardWrapper.resizeTooltip')

      // Move down twice (Configure -> Copy Link -> Resize)
      fireEvent.keyDown(menu, { key: 'ArrowDown' })
      fireEvent.keyDown(menu, { key: 'ArrowDown' })
      expect(resizeItem).toHaveFocus()

      // Move up once (Resize -> Copy Link)
      fireEvent.keyDown(menu, { key: 'ArrowUp' })
      expect(copyLinkItem).toHaveFocus()
    })

    it('Home key focuses the first menu item', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const configureItem = getItemByTitle('cardWrapper.configureTooltip')

      // Move away
      fireEvent.keyDown(menu, { key: 'ArrowDown' })
      fireEvent.keyDown(menu, { key: 'ArrowDown' })

      fireEvent.keyDown(menu, { key: 'Home' })
      expect(configureItem).toHaveFocus()
    })

    it('End key focuses the last menu item', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const removeItem = getItemByTitle('cardWrapper.removeTooltip')

      fireEvent.keyDown(menu, { key: 'End' })
      expect(removeItem).toHaveFocus()
    })

    it('ArrowDown at last item does not move focus past the end', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const removeItem = getItemByTitle('cardWrapper.removeTooltip')

      // Jump to end
      fireEvent.keyDown(menu, { key: 'End' })
      expect(removeItem).toHaveFocus()

      // Try to go past end
      fireEvent.keyDown(menu, { key: 'ArrowDown' })
      expect(removeItem).toHaveFocus()
    })

    it('ArrowUp at first item does not move focus before the start', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      const configureItem = getItemByTitle('cardWrapper.configureTooltip')

      expect(configureItem).toHaveFocus()

      fireEvent.keyDown(menu, { key: 'ArrowUp' })
      expect(configureItem).toHaveFocus()
    })
  })

  // -------------------------------------------------------------------------
  // CustomEvent coordination (#8556)
  // -------------------------------------------------------------------------
  describe('CustomEvent coordination', () => {
    it('opening the trigger dispatches a card-menu-open event with the cardId', () => {
      render(<CardActionMenu {...defaultProps()} />)

      const events: CustomEvent[] = []
      const handler = (e: Event) => events.push(e as CustomEvent)
      window.addEventListener('card-menu-open', handler)

      try {
        openMenu()

        const menuOpenEvents = events.filter((evt) => evt.type === 'card-menu-open')
        expect(menuOpenEvents).toHaveLength(1)
        expect(menuOpenEvents[0].detail).toBe(CARD_ID)
      } finally {
        // Enforce cleanup in finally block to prevent global event listener leaks
        window.removeEventListener('card-menu-open', handler)
      }
    })

    it('closes this menu when another card dispatches card-menu-open', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()

      // Another card opens its menu
      act(() => {
        window.dispatchEvent(new CustomEvent('card-menu-open', { detail: 'other-card-id' }))
      })

      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })

    it('does NOT close when the same cardId dispatches card-menu-open', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()

      // Same card fires again — should stay open
      act(() => {
        window.dispatchEvent(new CustomEvent('card-menu-open', { detail: CARD_ID }))
      })

      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Outside click dismiss
  // -------------------------------------------------------------------------
  describe('outside click', () => {
    it('closes the menu when clicking outside', () => {
      render(<CardActionMenu {...defaultProps()} />)
      openMenu()

      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()

      // Click on document body (outside the menu and trigger)
      fireEvent.mouseDown(document.body)

      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Conditional rendering
  // -------------------------------------------------------------------------
  describe('conditional rendering', () => {
    it('does not render width/height submenu triggers when handlers are absent', () => {
      render(
        <CardActionMenu
          cardId={CARD_ID}
          cardType={CARD_TYPE}
          onConfigure={vi.fn()}
          onRemove={vi.fn()}
          onShowWidgetExport={vi.fn()}
        />,
      )
      openMenu()

      // Width and height resize triggers should not be in the DOM
      expect(screen.queryByTitle('cardWrapper.resizeTooltip')).not.toBeInTheDocument()
      expect(screen.queryByTitle('cardWrapper.resizeHeightTooltip')).not.toBeInTheDocument()

      // But configure and remove should still be present
      expect(screen.getByTitle('cardWrapper.configureTooltip')).toBeInTheDocument()
      expect(screen.getByTitle('cardWrapper.removeTooltip')).toBeInTheDocument()
    })

    it('toggle: clicking trigger twice opens then closes the menu', () => {
      render(<CardActionMenu {...defaultProps()} />)

      const trigger = screen.getByRole('button', { name: TRIGGER_LABEL })
      fireEvent.click(trigger)
      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()

      fireEvent.click(trigger)
      expect(screen.queryByRole('menu', { name: MENU_LABEL })).not.toBeInTheDocument()
    })
  })
})
