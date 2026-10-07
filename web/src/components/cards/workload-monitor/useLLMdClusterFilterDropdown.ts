// Open/close state, anchor positioning and dismissal (click-outside / Escape)
// for the llm-d stack monitor cluster-filter flyout. Extracted from
// LLMdStackMonitor.tsx (issue #24058) — behavior unchanged.
import { useState, useRef, useEffect } from 'react'

/** Vertical gap between the filter button and the flyout, in px. */
const DROPDOWN_OFFSET_PX = 4
/** Width of the flyout, in px (matches w-48 in LLMdClusterFilter). */
const DROPDOWN_WIDTH_PX = 192
/** Minimum distance between the flyout and the viewport's left edge, in px. */
const DROPDOWN_VIEWPORT_MARGIN_PX = 8

export function useLLMdClusterFilterDropdown() {
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const clusterFilterBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null)

  // Compute dropdown position
  useEffect(() => {
    if (showClusterFilter && clusterFilterBtnRef.current) {
      const rect = clusterFilterBtnRef.current.getBoundingClientRect()
      setDropdownStyle({
        top: rect.bottom + DROPDOWN_OFFSET_PX,
        left: Math.max(DROPDOWN_VIEWPORT_MARGIN_PX, rect.right - DROPDOWN_WIDTH_PX) })
    } else {
      setDropdownStyle(null)
    }
  }, [showClusterFilter])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on Escape key
  useEffect(() => {
    if (!showClusterFilter) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowClusterFilter(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showClusterFilter])

  return {
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    clusterFilterBtnRef,
    dropdownStyle,
  }
}
