export interface Props {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'csv' | 'crds' | 'ai'

export interface CSVInfo {
  name: string
  displayName: string
  version: string
  phase: string
  description?: string
  provider?: string
  maturity?: string
  maintainers?: Array<{ name: string; email?: string }>
  links?: Array<{ name: string; url: string }>
  installModes?: Array<{ type: string; supported: boolean }>
}

export interface CRDInfo {
  name: string
  kind: string
  version: string
  description?: string
}

export interface CRDRaw {
  name: string
  kind: string
  version: string
  description?: string
}
