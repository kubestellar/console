/**
 * SidebarCollapseLogic — Collapse/expand state management for sidebar sections.
 *
 * Extracted from SidebarShell.tsx per issue #19012.
 * Manages which nav sections are collapsed/expanded.
 */
import { useState } from 'react'

export interface CollapsedSectionsState {
  collapsedSections: Record<string, boolean>
  toggleSection: (id: string) => void
  collapseSection: (id: string) => void
  expandSection: (id: string) => void
  collapseAll: () => void
  expandAll: () => void
}

/**
 * Hook to manage section collapse state.
 * Returns the current state and helper functions to toggle/collapse/expand sections.
 */
export function useCollapsedSections(): CollapsedSectionsState {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const collapseSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: true }))
  }

  const expandSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: false }))
  }

  const collapseAll = () => {
    setCollapsedSections(prev => {
      const next: Record<string, boolean> = {}
      for (const key in prev) {
        next[key] = true
      }
      return next
    })
  }

  const expandAll = () => {
    setCollapsedSections({})
  }

  return {
    collapsedSections,
    toggleSection,
    collapseSection,
    expandSection,
    collapseAll,
    expandAll,
  }
}
