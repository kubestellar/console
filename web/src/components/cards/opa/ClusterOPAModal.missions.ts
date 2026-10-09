import type { Policy, StartMissionFn } from './types'

type MissionParams = Parameters<StartMissionFn>[0]

/** Mission that walks the user through creating a new Gatekeeper policy with AI. */
export function buildCreatePolicyWithAIMission(clusterName: string): MissionParams {
  return {
    title: 'Create OPA Gatekeeper Policy',
    description: 'Create a new OPA Gatekeeper policy with AI assistance',
    type: 'deploy',
    cluster: clusterName,
    initialPrompt: `I want to create a new OPA Gatekeeper policy for the cluster "${clusterName}".

Please help me:
1. Ask me what kind of policy I want to enforce (e.g., require labels, restrict images, enforce resource limits)
2. Generate the appropriate ConstraintTemplate and Constraint
3. Help me apply it to the cluster
4. Test that the policy is working

Let's start by discussing what kind of policy I need.`,
    context: { clusterName },
  }
}

/** Mission that edits an existing Gatekeeper policy with AI assistance. */
export function buildEditPolicyWithAIMission(clusterName: string, policy: Policy): MissionParams {
  return {
    title: `Edit Policy: ${policy.name}`,
    description: `Modify OPA Gatekeeper policy ${policy.name}`,
    type: 'deploy',
    cluster: clusterName,
    initialPrompt: `I want to edit the OPA Gatekeeper policy "${policy.name}" (kind: ${policy.kind}) on cluster "${clusterName}".

Current enforcement mode: ${policy.mode}
Current violations: ${policy.violations}

Please help me:
1. Fetch the current policy YAML
2. Ask me what changes I want to make
3. Update the policy
4. Verify the changes

What would you like to modify about this policy?`,
    context: { clusterName, policy },
  }
}
