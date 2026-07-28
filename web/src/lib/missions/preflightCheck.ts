/**
 * Mission preflight check barrel — re-exports from the checks/ sub-module.
 *
 * Split into focused files — see issue #15790 / #21610:
 *   checks/preflightCheck.checks.ts — all check functions and types
 *
 * All existing imports from '@/lib/missions/preflightCheck' continue to work.
 */
export type {
  PreflightErrorCode,
  PreflightError,
  RequiredOperation,
  PreflightResult,
  RemediationAction,
  ToolCheckResult,
  ToolPreflightResult,
  KubectlExecFn,
} from './checks/preflightCheck.checks'

export {
  classifyKubectlError,
  getRemediationActions,
  resolveRequiredTools,
  runToolPreflightCheck,
  runClusterReadinessCheck,
  runPreflightCheck,
} from './checks/preflightCheck.checks'
