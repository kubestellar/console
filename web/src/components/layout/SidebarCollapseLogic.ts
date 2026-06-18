import { useState, useCallback } from 'react'

export function useSidebarCollapseLogic() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const isSectionOpen = useCallback((id: string) => !collapsedSections[id], [collapsedSections])

  return {
    collapsedSections,
    isSectionOpen,
    toggleSection,
  }
}
