import { useState, useEffect, useRef, useMemo } from 'react'
import { Shield, Loader2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { BaseModal } from '../../../lib/modals'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { useToast } from '../../ui/Toast'
import type { GatekeeperStatus, StartMissionFn } from './types'
import { POLICY_TEMPLATES } from './types'
import { copyToClipboard } from '../../../lib/clipboard'
import { summarizePodSecurity } from './CreatePolicyModal.analysis'
import {
  CreatePolicyChooseFlow, CreatePolicyDescribeFlow, CreatePolicyTemplateFlow, CreatePolicyYamlFlow,
  type CreateFlow,
} from './CreatePolicyModal.flows'

const OPA_CREATE_TIMEOUT_MS = 20_000

// CreatePolicyModal — AI-driven policy creation from the main card
export function CreatePolicyModal({
  isOpen,
  onClose,
  statuses,
  startMission,
}: {
  isOpen: boolean
  onClose: () => void
  statuses: Record<string, GatekeeperStatus>
  startMission: StartMissionFn
}) {
  const { showToast } = useToast()
  const [selectedCluster, setSelectedCluster] = useState('')
  const [flow, setFlow] = useState<CreateFlow>('choose')
  const [userDescription, setUserDescription] = useState('')
  const [yamlContent, setYamlContent] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Clusters that have Gatekeeper installed
  const installedClusters = useMemo(
    () => Object.entries(statuses).filter(([, s]) => s.installed).map(([name]) => name),
    [statuses]
  )

  // Reset state and auto-select first installed cluster when modal opens
  useEffect(() => {
    if (isOpen) {
      setFlow('choose')
      setUserDescription('')
      setYamlContent('')
      setIsAnalyzing(false)
      setSelectedCluster(installedClusters.length > 0 ? installedClusters[0] : '')
    }
  }, [isOpen, installedClusters])

  // Gather cluster security data and start AI mission
  const handleAnalyzeAndSuggest = async () => {
    if (!selectedCluster) return
    setIsAnalyzing(true)

    try {
      // Gather security data from the cluster
      let securitySummary = ''
      let resourceLimitsSummary = ''

      try {
        const podsResult = await kubectlProxy.exec(
          ['get', 'pods', '-A', '-o', 'json'],
          { context: selectedCluster, timeout: OPA_CREATE_TIMEOUT_MS }
        )

        if (podsResult.output) {
          ({ securitySummary, resourceLimitsSummary } = summarizePodSecurity(podsResult.output))
        }
      } catch {
        securitySummary = 'Could not fetch pod data (cluster may be unreachable)'
        resourceLimitsSummary = 'N/A'
      }

      // Get existing policies
      const existingPolicies = (statuses[selectedCluster]?.policies ?? []).map(p => p.name).join(', ') || 'none'

      if (!mountedRef.current) return
      onClose()
      startMission({
        title: `AI: Analyze & Create Policies for ${selectedCluster}`,
        description: 'AI scans cluster security posture and suggests OPA policies',
        type: 'deploy',
        cluster: selectedCluster,
        initialPrompt: `Analyze the security posture of cluster "${selectedCluster}" and create OPA Gatekeeper policies to address the gaps.

Current cluster state:
--- Security Issues ---
${securitySummary || 'No issues detected'}

--- Resource Limits ---
${resourceLimitsSummary || 'All containers have limits'}

--- Existing OPA Policies ---
${existingPolicies}

Based on this analysis:
1. Identify the most critical gaps that OPA policies should address
2. For each gap, generate a ConstraintTemplate + Constraint YAML
3. Start with enforcementAction: dryrun so existing workloads aren't disrupted
4. Apply the policies to the cluster with my approval
5. After applying, check for immediate violations and report them

Start with the highest-priority policy.`,
        context: { cluster: selectedCluster },
      })
    } catch (err: unknown) {
      console.error('[OPA] Failed to analyze cluster:', err)
      if (mountedRef.current) showToast('Failed to gather cluster data', 'error')
    } finally {
      if (mountedRef.current) setIsAnalyzing(false)
    }
  }

  // Start AI mission with user's description
  const handleDescribeMission = () => {
    if (!selectedCluster || !userDescription.trim()) return
    onClose()
    startMission({
      title: `AI: Create Policy for ${selectedCluster}`,
      description: 'AI generates OPA policy from user description',
      type: 'deploy',
      cluster: selectedCluster,
      initialPrompt: `Create an OPA Gatekeeper policy for cluster "${selectedCluster}" based on this requirement:

"${userDescription.trim()}"

Please:
1. Generate the ConstraintTemplate and Constraint YAML
2. Explain what the policy does and what it catches
3. Apply it to the cluster with enforcementAction: dryrun first
4. Show any immediate violations
5. Ask if I want to escalate to warn or enforce`,
      context: { cluster: selectedCluster, description: userDescription.trim() },
    })
  }

  // Apply custom YAML via AI mission
  const handleApplyCustomYaml = () => {
    if (!selectedCluster || !yamlContent.trim()) return
    onClose()
    startMission({
      title: 'Apply OPA Policy',
      description: `Apply OPA Gatekeeper policy YAML to ${selectedCluster}`,
      type: 'deploy',
      cluster: selectedCluster,
      initialPrompt: `Please apply the following OPA Gatekeeper policy YAML to cluster "${selectedCluster}":

\`\`\`yaml
${yamlContent}
\`\`\`

Steps:
1. Review the YAML for any issues
2. Apply it to the cluster using kubectl apply
3. Verify the policy was created/updated successfully
4. Check if there are any immediate violations

Please proceed with applying this policy.`,
      context: { cluster: selectedCluster, yaml: yamlContent },
    })
  }

  // Use a template — populate YAML editor
  const handleUseTemplate = (template: typeof POLICY_TEMPLATES[0]) => {
    setYamlContent(template.template)
    setFlow('yaml')
  }

  // Whether any cluster status is still loading (initial check in progress)
  const isClustersLoading = Object.values(statuses).some(s => s.loading)

  // No installed clusters — empty state
  const noGatekeeper = installedClusters.length === 0

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false} closeOnEscape={flow === 'choose'}>
      <BaseModal.Header
        title="Create OPA Policy"
        description="AI-powered policy creation"
        icon={Shield}
        onClose={onClose}
        showBack={flow !== 'choose'}
        onBack={() => setFlow('choose')}
      />

      <BaseModal.Content className="max-h-[60vh]">
        {isClustersLoading && installedClusters.length === 0 ? (
          /* Still checking clusters for Gatekeeper */
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin opacity-50" />
            <p className="text-sm">Checking clusters for OPA Gatekeeper...</p>
          </div>
        ) : noGatekeeper ? (
          /* No clusters with Gatekeeper */
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No clusters have OPA Gatekeeper installed</p>
            <p className="text-xs mb-4">Install Gatekeeper on a cluster first, then create policies.</p>
            <Button
              variant="accent"
              size="lg"
              onClick={() => {
                onClose()
                const firstCluster = Object.keys(statuses)[0]
                if (firstCluster) {
                  startMission({
                    title: `Install OPA Gatekeeper`,
                    description: 'Set up OPA Gatekeeper for policy enforcement',
                    type: 'deploy',
                    cluster: firstCluster,
                    initialPrompt: `I want to install OPA Gatekeeper on my cluster. Please help me install it using the official Helm chart and verify the installation is working.`,
                    context: {},
                  })
                }
              }}
              disabled={Object.keys(statuses).length === 0}
            >
              Install Gatekeeper with AI
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target Cluster Selector */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Target Cluster</label>
              <select
                value={selectedCluster}
                onChange={(e) => setSelectedCluster(e.target.value)}
                disabled={isAnalyzing}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50"
              >
                {installedClusters.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Flow: Choose creation method */}
            {flow === 'choose' && (
              <CreatePolicyChooseFlow
                selectedCluster={selectedCluster}
                isAnalyzing={isAnalyzing}
                onAnalyzeAndSuggest={handleAnalyzeAndSuggest}
                setFlow={setFlow}
              />
            )}

            {/* Flow: Describe what you need */}
            {flow === 'describe' && (
              <CreatePolicyDescribeFlow
                userDescription={userDescription}
                setUserDescription={setUserDescription}
                onGenerate={handleDescribeMission}
              />
            )}

            {/* Flow: From Template */}
            {flow === 'template' && (
              <CreatePolicyTemplateFlow onUseTemplate={handleUseTemplate} />
            )}

            {/* Flow: Custom YAML / Template editor */}
            {flow === 'yaml' && (
              <CreatePolicyYamlFlow
                selectedCluster={selectedCluster}
                yamlContent={yamlContent}
                setYamlContent={setYamlContent}
                onCopy={() => {
                  copyToClipboard(yamlContent)
                  showToast('Copied to clipboard', 'success')
                }}
                onApply={handleApplyCustomYaml}
              />
            )}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <Button
          variant="ghost"
          size="lg"
          onClick={onClose}
        >
          Cancel
        </Button>
        <div className="flex-1" />
      </BaseModal.Footer>
    </BaseModal>
  )
}
