import { PolicyDetailModal, ClusterOPAModal, CreatePolicyModal } from './opa'
import type { Policy, GatekeeperStatus, StartMissionFn } from './opa'

// Split helper component; parent card owns useCardLoadingState.
// Child BaseModal implementations handle closed state internally.
interface OPAPoliciesModalProps {
  showViolationsModal: boolean
  closeViolationsModal: () => void
  selectedClusterForViolations: string
  statuses: Record<string, GatekeeperStatus>
  onRefresh: () => void
  startMission: StartMissionFn
  showPolicyModal: boolean
  closePolicyModal: () => void
  selectedPolicy: Policy | null
  setSelectedPolicy: (p: Policy | null) => void
  onAddPolicy: (name?: string) => void
  showCreatePolicyModal: boolean
  closeCreatePolicyModal: () => void
}

export function OPAPoliciesModal({
  showViolationsModal, closeViolationsModal,
  selectedClusterForViolations, statuses, onRefresh, startMission,
  showPolicyModal, closePolicyModal,
  selectedPolicy, setSelectedPolicy, onAddPolicy,
  showCreatePolicyModal, closeCreatePolicyModal,
}: OPAPoliciesModalProps) {
  const open = showViolationsModal || showPolicyModal || showCreatePolicyModal
  if (!open) return null
  return (
    <>
      {/* Cluster OPA Modal — Full CRUD */}
      <ClusterOPAModal
        isOpen={showViolationsModal}
        onClose={closeViolationsModal}
        clusterName={selectedClusterForViolations}
        policies={statuses[selectedClusterForViolations]?.policies || []}
        violations={statuses[selectedClusterForViolations]?.violations || []}
        onRefresh={onRefresh}
        startMission={startMission}
      />

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <PolicyDetailModal
          isOpen={showPolicyModal}
          onClose={() => {
            closePolicyModal()
            setSelectedPolicy(null)
          }}
          policy={selectedPolicy}
          violations={Object.values(statuses).flatMap(s => s.violations || [])}
          onAddPolicy={() => onAddPolicy(selectedPolicy.name)}
        />
      )}

      {/* Create Policy Modal — AI-driven policy creation */}
      <CreatePolicyModal
        isOpen={showCreatePolicyModal}
        onClose={closeCreatePolicyModal}
        statuses={statuses}
        startMission={startMission}
      />
    </>
  )
}
