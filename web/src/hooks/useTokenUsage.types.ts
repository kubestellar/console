export type TokenCategory = 'missions' | 'diagnose' | 'insights' | 'predictions' | 'other'

export interface TokenUsageByCategory {
  missions: number
  diagnose: number
  insights: number
  predictions: number
  other: number
}

export interface TokenUsage {
  used: number
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
  resetDate: string
  byCategory: TokenUsageByCategory
}

export type TokenAlertLevel = 'normal' | 'warning' | 'critical' | 'stopped'
