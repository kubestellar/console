/**
 * WorkloadImportDialog - backward-compatible shim.
 *
 * The implementation was split (see #22974) into focused modules under
 * `./workload-import/` (constants, parsing utilities, the `useWorkloadImport`
 * hook, and one presentational component per import tab). This file is kept
 * so existing imports of `./WorkloadImportDialog` continue to work unchanged.
 *
 * Note: unlike most cards in this directory, this component is a modal
 * dialog and intentionally does not use `useCardLoadingState` (it has no
 * unified card loading/error state of its own — see CardDataContext).
 */
export { WorkloadImportDialog } from './workload-import/WorkloadImportDialog'
export type { WorkloadImportDialogProps } from './workload-import/WorkloadImportDialog'
