import { useMemo } from 'react'
import { FileText, Terminal, Zap, Code, Info, Tag, Layers, TerminalSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TabType } from './pod-drilldown'

export function usePodTabs() {
  const { t } = useTranslation()

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'labels', label: t('drilldown.tabs.labels'), icon: Tag },
    { id: 'related', label: t('drilldown.tabs.related'), icon: Layers },
    { id: 'describe', label: t('drilldown.tabs.describe'), icon: FileText },
    { id: 'logs', label: t('drilldown.tabs.logs'), icon: Terminal },
    { id: 'exec', label: t('drilldown.tabs.exec'), icon: TerminalSquare },
    { id: 'events', label: t('drilldown.tabs.events'), icon: Zap },
    { id: 'yaml', label: t('drilldown.tabs.yaml'), icon: Code },
  ]

  return { TABS }
}

// Extract container names from YAML output for exec tab
export function useContainerNames(yamlOutput: string | null): string[] {
  return useMemo(() => {
    if (!yamlOutput) return []
    const names: string[] = []
    const lines = yamlOutput.split('\n')
    let inContainerSection = false
    for (const line of lines) {
      if (/^ {2}(?:init)?containers:\s*$/.test(line)) {
        inContainerSection = true
        continue
      }
      if (inContainerSection && /^ {2}[a-z]/.test(line)) {
        inContainerSection = false
      }
      if (inContainerSection) {
        const match = line.match(/^ {4}name:\s+(.+)$/)
        if (match) {
          const name = match[1].trim()
          if (name && !names.includes(name)) {
            names.push(name)
          }
        }
      }
    }
    return names
  }, [yamlOutput])
}
