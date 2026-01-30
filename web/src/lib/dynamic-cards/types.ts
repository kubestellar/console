import type { ComponentType } from 'react'
import type { CardComponentProps } from '../../components/cards/cardRegistry'

/**
 * Tier of a dynamic card definition.
 *
 * - tier1: Declarative JSON config rendered by the card runtime.
 *   Safe, no transpilation, covers 80%+ of use cases.
 * - tier2: Custom TSX code transpiled in-browser by Sucrase.
 *   Runs inside React Error Boundary with controlled scope.
 */
export type DynamicCardTier = 'tier1' | 'tier2'

/** Column definition for Tier 1 declarative cards */
export interface DynamicCardColumn {
  /** Field name in the data */
  field: string
  /** Display label */
  label: string
  /** Column width (CSS) */
  width?: string
  /** Optional render format: 'text' | 'badge' | 'number' | 'date' */
  format?: 'text' | 'badge' | 'number' | 'date'
  /** Badge color map (for format: 'badge') */
  badgeColors?: Record<string, string>
}

/** Stat definition for Tier 1 card stat blocks */
export interface DynamicCardStat {
  /** Display label */
  label: string
  /** Data field or expression */
  value: string
  /** Color class */
  color?: string
  /** Icon name from lucide-react */
  icon?: string
}

/** Tier 1 declarative card definition */
export interface DynamicCardDefinition_T1 {
  /** Data source: 'static' | 'api' | 'hook' */
  dataSource: 'static' | 'api'
  /** Static data (for dataSource: 'static') */
  staticData?: Record<string, unknown>[]
  /** API endpoint (for dataSource: 'api') */
  apiEndpoint?: string
  /** Column definitions for list/table view */
  columns?: DynamicCardColumn[]
  /** Stat block definitions */
  stats?: DynamicCardStat[]
  /** Layout: 'list' | 'stats' | 'stats-and-list' */
  layout: 'list' | 'stats' | 'stats-and-list'
  /** Searchable field names */
  searchFields?: string[]
  /** Default items per page */
  defaultLimit?: number
  /** Empty state message */
  emptyMessage?: string
}

/** Full dynamic card definition */
export interface DynamicCardDefinition {
  /** Unique card identifier */
  id: string
  /** Display title */
  title: string
  /** Card tier */
  tier: DynamicCardTier
  /** Description */
  description?: string
  /** Icon name (from lucide-react) */
  icon?: string
  /** Icon color class */
  iconColor?: string
  /** Default width in grid columns (out of 12) */
  defaultWidth?: number
  /** Creation timestamp */
  createdAt: string
  /** Last modified timestamp */
  updatedAt: string

  /** Tier 1: Declarative card definition */
  cardDefinition?: DynamicCardDefinition_T1

  /** Tier 2: Raw TSX source code */
  sourceCode?: string
  /** Tier 2: Compiled JavaScript code (cached) */
  compiledCode?: string
  /** Tier 2: Compilation error if any */
  compileError?: string

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/** Props for the DynamicCard meta-component */
export interface DynamicCardProps extends CardComponentProps {
  /** ID of the dynamic card definition to render */
  dynamicCardId?: string
}

/** Result of compiling Tier 2 TSX source */
export interface CompileResult {
  /** Compiled JavaScript code */
  code: string | null
  /** Compilation error message */
  error: string | null
}

/** Compiled Tier 2 component (or error info) */
export interface DynamicComponentResult {
  /** The React component (if compilation succeeded) */
  component: ComponentType<CardComponentProps> | null
  /** Error message (if compilation or evaluation failed) */
  error: string | null
}
