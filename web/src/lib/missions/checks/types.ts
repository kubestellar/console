/**
 * Preflight check shared types.
 *
 * Extracted from preflightCheck.ts as part of the checks/ split (tracked by #15790).
 */

export type PreflightErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'EXPIRED_CREDENTIALS'
  | 'RBAC_DENIED'
  | 'CONTEXT_NOT_FOUND'
  | 'CLUSTER_UNREACHABLE'
  | 'MISSING_TOOLS'
  | 'UNKNOWN_EXECUTION_FAILURE'

export interface PreflightError {
  code: PreflightErrorCode
  message: string
  /** Additional details (e.g., denied verb/resource, available contexts) */
  details?: Record<string, unknown>
}

export interface RequiredOperation {
  verb: string
  resource: string
  namespace?: string
}

export interface PreflightResult {
  ok: boolean
  error?: PreflightError
  /** The cluster context that was checked */
  context?: string
  /** Mission-specific operations that were denied during preflight */
  deniedOps?: RequiredOperation[]
}

export interface RemediationAction {
  label: string
  description: string
  /** If set, render a code block the user can copy */
  codeSnippet?: string
  /** Action type for the UI to render the right control */
  actionType: 'copy' | 'retry' | 'link' | 'info'
  /** URL for link-type actions */
  href?: string
}

/** A single tool availability result. */
export interface ToolCheckResult {
  name: string
  installed: boolean
  version?: string
  path?: string
}

/** Outcome of the tool pre-flight scan. */
export interface ToolPreflightResult {
  ok: boolean
  /** Present when ok is false. */
  error?: PreflightError
  /** Per-tool details regardless of pass/fail. */
  tools: ToolCheckResult[]
}

export interface KubectlExecFn {
  (args: string[], options?: { context?: string; timeout?: number; priority?: boolean }): Promise<{
    output: string
    exitCode: number
    error?: string
  }>
}
