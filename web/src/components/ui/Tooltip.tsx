/**
 * Tooltip — shared hover tooltip primitive.
 *
 * CSS-only hover/focus implementation using Tailwind group utilities so
 * tooltips work without JS state or portal wiring. When `children` is a
 * valid React element, the child is cloned and receives an
 * `aria-describedby` attribute pointing at the floating bubble so screen
 * readers announce the help text when the focusable trigger is focused.
 * If the child is not a valid element (string, fragment, array), we fall
 * back to rendering the bubble without wiring `aria-describedby` — in that
 * case screen-reader description is not guaranteed, but visual hover still
 * works. Callers should prefer a single focusable child element.
 *
 * Motion is handled via a Tailwind `transition-opacity` that respects the
 * global `.reduce-motion` class defined in `index.css` (which zeroes all
 * transition durations for users who prefer reduced motion).
 *
 * Usage:
 *   <Tooltip content={t('help.aiMissions')}>
 *     <SomeIconButton />
 *   </Tooltip>
 */

import React, { type ReactNode, useId } from 'react'
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
 * Tailwind class for the maximum width of the tooltip bubble. Using
 * `max-w-xs` (20rem) as a semantic design token keeps long help strings
 * from overflowing the viewport while allowing the bubble to wrap onto
 * multiple lines via `whitespace-normal`.
 */
const TOOLTIP_MAX_WIDTH_CLASS = 'max-w-xs'

/**
 * Side positioning classes. Keyed by the `side` prop — each entry places
 * the tooltip bubble relative to the wrapping trigger container.
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
   * Extra classes to merge onto the outer wrapper `<div>`. The wrapper is a
   * `<div>` styled `inline-flex` so it can legally contain block-level
   * children (e.g. full-width sidebar rows that use `<div>` internally).
   * Useful for callers that need the trigger container to stretch to its
   * parent — pass `block w-full`.
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

  // Clone the child so `aria-describedby` lands on the actual focusable
  // trigger instead of the wrapper — screen readers only announce the
  // description when the focused element carries the attribute. If the
  // child already has an `aria-describedby`, preserve it by space-joining.
  const childWithAria = React.isValidElement(children)
    ? React.cloneElement(
        children as React.ReactElement<{ 'aria-describedby'?: string }>,
        {
          'aria-describedby': [
            (children as React.ReactElement<{ 'aria-describedby'?: string }>)
              .props['aria-describedby'],
            tooltipId,
          ]
            .filter(Boolean)
            .join(' '),
        },
      )
    : children

  return (
    <div className={cn('group relative inline-flex', wrapperClassName)}>
      {childWithAria}
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
          'rounded-md px-2 py-1 text-xs text-center',
          'whitespace-normal',
          TOOLTIP_MAX_WIDTH_CLASS,
          className,
        )}
      >
        {content}
      </span>
    </div>
  )
}

export default Tooltip
export type { TooltipProps, TooltipSide }
