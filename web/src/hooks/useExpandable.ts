/**
 * Reusable hook for managing expandable/collapsible sections
 * Common pattern: toggling expanded state for accordion-style UI elements
 */

import { useState, useCallback } from 'react'

/**
 * Hook for managing expandable sections
 * @param defaultExpanded - Array of IDs that should be expanded by default
 * @returns Object with expanded Set, toggle methods, and utility methods
 */
export function useExpandable(defaultExpanded: string[] = []) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(defaultExpanded)
  )

  /**
   * Toggle expansion state for a single item
   */
  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /**
   * Check if an item is expanded
   */
  const isExpanded = useCallback((id: string) => {
    return expanded.has(id)
  }, [expanded])

  /**
   * Expand an item (idempotent)
   */
  const expand = useCallback((id: string) => {
    setExpanded(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  /**
   * Collapse an item (idempotent)
   */
  const collapse = useCallback((id: string) => {
    setExpanded(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  /**
   * Expand all items from a list
   */
  const expandAll = useCallback((ids: string[]) => {
    setExpanded(new Set(ids))
  }, [])

  /**
   * Collapse all items
   */
  const collapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])

  return {
    expanded,
    toggle,
    isExpanded,
    expand,
    collapse,
    expandAll,
    collapseAll,
  }
}
