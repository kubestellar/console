/**
 * FederationActionButton — generic button for executing a federation action.
 *
 * This component:
 * 1. Runs a SelfSubjectAccessReview (SSAR) via useCanI to check if the user
 *    has permission to perform the action. Renders null if denied.
 * 2. For destructive actions (ActionDescriptor.destructive === true), shows a
 *    ConfirmDialog before executing.
 * 3. Calls executeFederationAction() and reports the result via onComplete.
 *
 * Phase 2 of the federation roll-out — PR F.
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../../lib/modals/ConfirmDialog'
import { useCanI } from '../../hooks/usePermissions'
import { executeFederationAction } from '../../hooks/useFederationActions'
import type { ActionDescriptor, ActionResult, ActionRequest } from '../../hooks/useFederationActions'

/** Map of action verbs to Kubernetes resource names for SSAR checks. */
const ACTION_RESOURCE_MAP: Record<string, string> = {
  'ocm.approveCSR': 'certificatesigningrequests/approval',
  'ocm.acceptCluster': 'managedclusters',
  'ocm.detachCluster': 'managedclusters',
  'ocm.taintCluster': 'managedclusters',
}

/** Kubernetes API group for OCM ManagedCluster resources. */
const OCM_API_GROUP = 'cluster.open-cluster-management.io'

/** API group for CSR resources. */
const CERTIFICATES_API_GROUP = 'certificates.k8s.io'

interface FederationActionButtonProps {
  /** The action descriptor from the provider's Actions() list. */
  action: ActionDescriptor
  /** The kubeconfig context hosting the federation hub. */
  hubContext: string
  /** The target cluster name (required for cluster-scoped actions). */
  clusterName?: string
  /** Extra payload to pass to the action (e.g. taint key/value/effect). */
  payload?: Record<string, unknown>
  /** Callback invoked after the action completes (success or failure). */
  onComplete?: (result: ActionResult) => void
  /** Optional CSS class name. */
  className?: string
}

export function FederationActionButton({
  action,
  hubContext,
  clusterName,
  payload,
  onComplete,
  className,
}: FederationActionButtonProps) {
  const { checkPermission } = useCanI()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Run SSAR check on mount to determine if the button should render.
  useEffect(() => {
    const resource = ACTION_RESOURCE_MAP[action.id] || 'managedclusters'
    const group = resource.includes('certificatesigningrequests')
      ? CERTIFICATES_API_GROUP
      : OCM_API_GROUP

    checkPermission({
      cluster: hubContext,
      verb: action.verb,
      resource,
      group,
    }).then((res) => {
      setAllowed(res.allowed)
    })
  }, [action.id, action.verb, hubContext, checkPermission])

  const executeAction = useCallback(async () => {
    setLoading(true)
    try {
      const req: ActionRequest = {
        actionId: action.id,
        provider: action.provider,
        hubContext,
        clusterName,
        payload,
      }
      const result = await executeFederationAction(req)
      onComplete?.(result)
    } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }, [action, hubContext, clusterName, payload, onComplete])

  const handleClick = useCallback(() => {
    if (action.destructive) {
      setShowConfirm(true)
    } else {
      executeAction()
    }
  }, [action.destructive, executeAction])

  // Don't render if SSAR check hasn't completed or is denied.
  if (allowed === null || allowed === false) {
    return null
  }

  return (
    <>
      <Button
        variant={action.destructive ? 'danger' : 'primary'}
        size="sm"
        loading={loading}
        disabled={loading}
        onClick={handleClick}
        className={className}
        aria-label={action.label}
      >
        {action.label}
      </Button>

      {action.destructive && (
        <ConfirmDialog
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={executeAction}
          title={action.label}
          message={`This will ${action.label.toLowerCase()} "${clusterName || 'the resource'}". This action cannot be undone.`}
          confirmLabel={action.label}
          variant="danger"
          isLoading={loading}
        />
      )}
    </>
  )
}
