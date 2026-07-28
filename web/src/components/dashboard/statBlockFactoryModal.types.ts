import type { StatBlockColor } from '../../lib/stats/types'

export interface StatBlockFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onStatsCreated?: (type: string) => void
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

export type Tab = 'builder' | 'ai' | 'manage'

export interface BlockEditorItem {
  id: string
  label: string
  icon: string
  color: StatBlockColor
  field: string
  format: string
  tooltip: string
}

export interface StatAssistResult {
  title?: string
  blocks?: {
    label: string
    icon: string
    color: string
    field: string
    format?: string
    tooltip?: string
  }[]
}

export interface AiStatBlockResult {
  title: string
  type: string
  blocks: {
    id: string
    label: string
    icon: string
    color: string
    field: string
    format: string
    tooltip: string
  }[]
}
