export interface Props {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'changes' | 'diff' | 'ai'

export interface DriftChange {
  kind: string
  name: string
  namespace?: string
  changeType: 'added' | 'modified' | 'deleted'
  gitValue?: string
  clusterValue?: string
  diff?: string
  fields?: Array<{ path: string; gitValue: string; clusterValue: string }>
}
