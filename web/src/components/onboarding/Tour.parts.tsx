import type { TourStep } from '../../hooks/useTour'

export interface TooltipPosition {
  top?: number
  bottom?: number
  left?: number
  right?: number
  // For clamping without CSS transform conflicts
  useAbsoluteLeft?: boolean
}

export const TOOLTIP_WIDTH = 320 // w-80 = 20rem = 320px
export const TOOLTIP_HEIGHT = 300 // Approximate height including all content (header + content + footer + keyboard hints)
export const VIEWPORT_PADDING = 16 // Minimum distance from viewport edge
export const TOOLTIP_GAP = 12 // Gap between tooltip and target element
export const NEAR_TOP_THRESHOLD = 100 // Distance from viewport top (px) at which navbar items trigger top-aligned tooltip

export function getTooltipPosition(
  targetRect: DOMRect,
  placement: TourStep['placement']
): TooltipPosition {
  const gap = TOOLTIP_GAP
  // Use clientWidth to exclude scrollbar width for accurate positioning
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight

  // eslint-disable-next-line no-useless-assignment
  let position: TooltipPosition = {}

  switch (placement) {
    case 'top': {
      // Position above target, centered horizontally
      const targetCenterX = targetRect.left + targetRect.width / 2

      // Check if near right edge - use absolute right positioning instead of transform
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      // Check if there's room above, otherwise flip to bottom
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const verticalPos = spaceAbove < TOOLTIP_HEIGHT && spaceBelow > TOOLTIP_HEIGHT
        ? { top: targetRect.bottom + gap }
        : { bottom: vh - targetRect.top + gap }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near right edge - use absolute right positioning (no transform needed)
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true, // Signal to not use transform
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near left edge - use absolute left positioning (no transform needed)
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        // Centered positioning with transform
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
      break
    }
    case 'bottom': {
      // Position below target, centered horizontally
      const targetCenterX = targetRect.left + targetRect.width / 2

      // Check if near right edge - use absolute right positioning instead of transform
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      // Check if there's room below (with buffer), otherwise flip to top
      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      let verticalPos: { top?: number; bottom?: number }
      if (spaceBelow < TOOLTIP_HEIGHT && spaceAbove > TOOLTIP_HEIGHT) {
        // Flip to top
        verticalPos = { bottom: vh - targetRect.top + gap }
      } else if (spaceBelow < TOOLTIP_HEIGHT && spaceAbove <= TOOLTIP_HEIGHT) {
        // Neither above nor below has enough space - position so tooltip bottom is at viewport edge
        verticalPos = { top: Math.max(VIEWPORT_PADDING, vh - TOOLTIP_HEIGHT - VIEWPORT_PADDING) }
      } else {
        verticalPos = { top: targetRect.bottom + gap }
      }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near right edge - use absolute right positioning (no transform needed)
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true, // Signal to not use transform
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        // Near left edge - use absolute left positioning (no transform needed)
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        // Centered positioning with transform
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
      break
    }
    case 'left': {
      // Position to the left of target
      // For navbar items at the top, position tooltip top near the target top
      // This avoids centering which pushes it down
      let top = targetRect.top + targetRect.height / 2

      // For items near the top of the viewport (like navbar), align tooltip top with target
      // instead of centering. This keeps the tooltip near the top of the page.
      const isNearTop = targetRect.top < NEAR_TOP_THRESHOLD
      if (isNearTop) {
        // Align top of tooltip with top of target, with small offset
        top = targetRect.top - 10
        // Ensure it doesn't go above viewport
        top = Math.max(VIEWPORT_PADDING, top)
      } else {
        // For other elements, use centered positioning with clamping
        const effectiveHalfHeight = TOOLTIP_HEIGHT / 2 + 20
        const minTop = effectiveHalfHeight + VIEWPORT_PADDING
        const maxTop = vh - effectiveHalfHeight - VIEWPORT_PADDING
        top = Math.max(minTop, Math.min(maxTop, top))
      }

      // Use smaller gap for left placement (closer to target)
      const leftGap = 8
      // Check if there's room to the left, otherwise flip to right
      const spaceLeft = targetRect.left - leftGap
      if (spaceLeft < TOOLTIP_WIDTH && (vw - targetRect.right - leftGap) > TOOLTIP_WIDTH) {
        // Flip to right
        position = {
          top,
          left: targetRect.right + leftGap,
          useAbsoluteLeft: isNearTop, // Don't use transform for top-aligned items
        }
      } else {
        position = {
          top,
          right: vw - targetRect.left + leftGap,
          useAbsoluteLeft: isNearTop, // Don't use transform for top-aligned items
        }
      }
      break
    }
    case 'right': {
      // Position to the right of target, centered vertically
      let top = targetRect.top + targetRect.height / 2
      // More conservative clamping - account for actual rendered height being potentially larger
      const effectiveHalfHeight = TOOLTIP_HEIGHT / 2 + 20 // Extra buffer for safety
      const minTop = effectiveHalfHeight + VIEWPORT_PADDING
      const maxTop = vh - effectiveHalfHeight - VIEWPORT_PADDING
      top = Math.max(minTop, Math.min(maxTop, top))

      // Check if there's room to the right, otherwise flip to left
      const spaceRight = vw - targetRect.right - gap
      if (spaceRight < TOOLTIP_WIDTH && (targetRect.left - gap) > TOOLTIP_WIDTH) {
        // Flip to left
        position = {
          top,
          right: vw - targetRect.left + gap,
        }
      } else {
        position = {
          top,
          left: targetRect.right + gap,
        }
      }
      break
    }
    default: {
      // Default to bottom placement with same logic as 'bottom' case
      const targetCenterX = targetRect.left + targetRect.width / 2
      const distanceFromRight = vw - targetCenterX
      const distanceFromLeft = targetCenterX

      const spaceBelow = vh - targetRect.bottom - gap - VIEWPORT_PADDING
      const spaceAbove = targetRect.top - gap - VIEWPORT_PADDING
      const verticalPos = spaceBelow < TOOLTIP_HEIGHT && spaceAbove > TOOLTIP_HEIGHT
        ? { bottom: vh - targetRect.top + gap }
        : { top: targetRect.bottom + gap }

      if (distanceFromRight < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        position = {
          ...verticalPos,
          right: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else if (distanceFromLeft < TOOLTIP_WIDTH / 2 + VIEWPORT_PADDING) {
        position = {
          ...verticalPos,
          left: VIEWPORT_PADDING,
          useAbsoluteLeft: true,
        }
      } else {
        position = {
          ...verticalPos,
          left: targetCenterX,
        }
      }
    }
  }

  return position
}
