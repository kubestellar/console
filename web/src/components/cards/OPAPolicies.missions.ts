import type { StartMissionParams } from '../../hooks/useMissions.types'

/** Mission that installs OPA Gatekeeper on a cluster. */
export function buildInstallOPAMission(clusterName: string): StartMissionParams {
  return {
    title: `Install OPA Gatekeeper on ${clusterName}`,
    description: 'Set up OPA Gatekeeper for policy enforcement',
    type: 'deploy',
    cluster: clusterName,
    initialPrompt: `I want to install OPA Gatekeeper on the cluster "${clusterName}".

Please:
1. Check if Gatekeeper is already installed. If not, install it.
2. After installation, ask:
   - "Gatekeeper is installed — should I set up a basic policy?"
   - "Something went wrong — want to see details?"
3. If I say set up a policy, create one and verify. Then ask:
   - "Should I create another policy?"
   - "All done"`,
    context: { clusterName } }
}

/** Mission that creates a new Gatekeeper policy, optionally modeled on an existing one. */
export function buildCreatePolicyMission(installedCluster: string, basedOnPolicy?: string): StartMissionParams {
  return {
    title: 'Create OPA Gatekeeper Policy',
    description: basedOnPolicy
      ? `Create a policy similar to ${basedOnPolicy}`
      : 'Create a new OPA Gatekeeper policy',
    type: 'deploy',
    cluster: installedCluster,
    initialPrompt: basedOnPolicy
      ? `I want to create a new OPA Gatekeeper policy similar to "${basedOnPolicy}".

Please:
1. Explain what the ${basedOnPolicy} policy does and ask what modifications I want.
2. Generate the ConstraintTemplate and Constraint, then ask:
   - "Ready to apply this to the cluster?"
   - "Want to adjust the rules first?"
3. If I say apply, deploy and test. Then ask:
   - "Should I create another policy?"
   - "All done"`
      : `I want to create a new OPA Gatekeeper policy for my Kubernetes cluster.

Please:
1. Ask me what kind of policy I want (e.g., require labels, restrict images, enforce resource limits).
2. Generate the ConstraintTemplate and Constraint, then ask:
   - "Ready to apply this to the cluster?"
   - "Want to adjust the rules first?"
3. If I say apply, deploy and test. Then ask:
   - "Should I create another policy?"
   - "All done"`,
    context: { basedOnPolicy } }
}
