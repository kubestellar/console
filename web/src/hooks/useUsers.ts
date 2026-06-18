import { getDemoConsoleUsers, getDemoUserManagementSummary } from './useUsers/demoData'
import { agentAuthHeaders } from './useUsers/shared'

export { useConsoleUsers, useUserManagementSummary } from './useUsers/useConsoleUserData'
export { useOpenShiftUsers, useAllOpenShiftUsers } from './useUsers/useOpenShiftUsers'
export {
  useK8sUsers,
  useK8sServiceAccounts,
  useAllK8sServiceAccounts,
  useK8sRoles,
  useK8sRoleBindings,
  useClusterPermissions,
} from './useUsers/useK8sAccess'
export const __testables = {
  agentAuthHeaders,
  getDemoConsoleUsers,
  getDemoUserManagementSummary,
}
