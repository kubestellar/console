/**
 * Shim re-exporting CustomDashboard from ./customDashboard/CustomDashboard.
 *
 * The implementation was split into focused modules (state/data hook, drag
 * hook, stats hook, and grid component) to keep each file small and
 * maintainable. See web/src/components/dashboard/customDashboard/ for the
 * full implementation.
 */
export { CustomDashboard } from './customDashboard/CustomDashboard'
