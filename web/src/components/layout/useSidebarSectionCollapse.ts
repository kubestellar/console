import { useState } from 'react'

/**
 * Manages the collapse/expand state of sidebar navigation sections.
 *
 * Extracted from SidebarShell.tsx (issue #19012).
 */
export function useSidebarSectionCollapse() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return { collapsedSections, toggleSection }
}
