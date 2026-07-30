import { useState } from 'react'

/**
 * Simple hook for tracking hover state with mouse event handlers.
 * Returns isHovered boolean and hoverProps to spread onto an element.
 */
export function useHoverState() {
  const [isHovered, setIsHovered] = useState(false)
  return {
    isHovered,
    hoverProps: {
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
  }
}
