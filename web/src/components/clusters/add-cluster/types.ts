export type TabId = 'command-line' | 'import' | 'connect'

export type ImportState = 'idle' | 'previewing' | 'previewed' | 'importing' | 'done' | 'error'
export type ConnectStep = 1 | 2 | 3
export type ConnectState = 'idle' | 'testing' | 'tested' | 'adding' | 'done' | 'error'

export interface PreviewContext {
  context: string
  cluster: string
  server: string
  authMethod?: string
  isNew: boolean
}

export type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift'

export interface CloudCLIInfo {
  name: string
  provider: string
  found: boolean
  path?: string
}
