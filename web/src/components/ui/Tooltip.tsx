/**
 * Tooltip — shared hover tooltip primitive.
 *
 * CSS-only hover/focus implementation using Tailwind group utilities so
 * tooltips work without JS state or portal wiring. The child element
 * receives an `aria-describedby` pointing at the floating bubble so screen
 * readers announce the help text.
 *
 * Motion is handled via a Tailwind `transition-opacity` that respects the
 * global `.reduce-motion` class defined in `index.css` (which zeroes all
 * transition durations for users who prefer reduced motion).
 *
 * Usage:
 *   <Tooltip content={t('help.sidebarMissions')}>
 *     <SomeIconButton />
 *   </Tooltip>
 */

import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

// ── Named constants ─────────────────────────────────────────────────────────

/**
 * Tailwind class for the opacity fade duration on hover. Exported as a named
 * constant so the magic "150ms" is documented and reused consistently. The
 * global `.reduce-motion` rule in `index.css` zeroes out transitions, so this
 * automatically respects `prefers-reduced-motion`.
 */
const TOOLTIP_FADE_DURATION_CLASS = 'duration-150'

/**
 * Side positioning classes. Keyed by the `side` prop — each entry places
 * the tooltip bubble relative to the wrapping `<span>` trigger.
 */
const SIDE_POSITION_MAP = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1',
} as const

type TooltipSide = keyof typeof SIDE_POSITION_MAP

interface TooltipProps {
  /** Content to show inside the tooltip bubble (usually a translated string). */
  content: ReactNode
  /** Trigger element the user hovers/focuses. */
  children: ReactNode
  /** Which side of the trigger to render the bubble on. Defaults to `top`. */
  side?: TooltipSide
  /** Extra classes to merge onto the bubble. */
  className?: string
  /**
   * Extra classes to merge onto the outer wrapper `<span>`. Useful for
   * callers that need the trigger span to stretch to its parent (e.g.
   * full-width sidebar rows — pass `block w-full`).
   */
  wrapperClassName?: string
  /** If true, renders children unchanged with no wrapper or bubble. */
  disabled?: boolean
}

/**
 * Render a shared Tooltip with accessible wiring.
 *
 * When `disabled` is true or `content` is empty we short-circuit and return
 * `children` directly — this keeps the DOM flat and avoids unnecessary
 * wrappers when a caller conditionally opts out (e.g. on small screens).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  wrapperClassName,
  disabled,
}: TooltipProps) {
  const tooltipId = useId()

  if (disabled || content == null || content === '') {
    return <>{children}</>
  }

  return (
    <span
      className={cn('group relative inline-flex', wrapperClassName)}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'absolute z-dropdown',
          SIDE_POSITION_MAP[side],
          'pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          'transition-opacity',
          TOOLTIP_FADE_DURATION_CLASS,
          'bg-card text-card-foreground border border-border shadow-lg',
          'rounded-md px-2 py-1 text-xs whitespace-nowrap',
          className,
        )}
      >
        {content}
      </span>
    </span>
  )
}

export default Tooltip
export type { TooltipProps, TooltipSide }
