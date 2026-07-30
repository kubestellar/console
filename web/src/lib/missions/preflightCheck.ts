/**
 * Mission Preflight Check — barrel re-export.
 *
 * Validates Kubernetes cluster access before executing mutating mission steps.
 * Returns structured error codes with remediation guidance so the UI can show
 * targeted help instead of generic failure messages.
 *
 * Implementation has been split into focused sub-modules (tracked by #15790):
 *   - checks/types.ts      — shared types (PreflightError, PreflightResult, …)
 *   - checks/classifier.ts — classifyKubectlError
 *   - checks/remediation.ts — getRemediationActions
 *   - checks/tools.ts      — resolveRequiredTools, runToolPreflightCheck
 *   - checks/runner.ts     — runClusterReadinessCheck, runPreflightCheck
 *
 * All existing `from '…/preflightCheck'` imports continue to resolve correctly.
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
} from './checks/types'

export { classifyKubectlError } from './checks/classifier'
export { getRemediationActions } from './checks/remediation'
export { resolveRequiredTools, runToolPreflightCheck } from './checks/tools'
export { runClusterReadinessCheck, runPreflightCheck } from './checks/runner'
