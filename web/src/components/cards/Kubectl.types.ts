export interface CommandHistoryItem {
  id: string
  context: string
  command: string
  output: string
  timestamp: Date
  success: boolean
}

export interface YAMLManifest {
  id: string
  name: string
  content: string
  timestamp: Date
}

export type OutputFormat = 'table' | 'yaml' | 'json' | 'wide'
