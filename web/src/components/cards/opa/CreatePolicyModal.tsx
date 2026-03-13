import { useState, useEffect, useRef, useMemo } from 'react'
import { Shield, FileCode, LayoutTemplate, Sparkles, Copy, MessageSquareText, ScanSearch, Loader2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { BaseModal } from '../../../lib/modals'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { useToast } from '../../ui/Toast'
import type { GatekeeperStatus, StartMissionFn } from './types'
import { POLICY_TEMPLATES } from './types'

// Creation flow type for CreatePolicyModal
type CreateFlow = 'choose' | 'describe' | 'template' | 'yaml'

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
          { context: selectedCluster, timeout: 20000 }
        )

        if (podsResult.output) {
          const podsData = JSON.parse(podsResult.output)
          const pods = podsData.items || []

          // Analyze security issues
          let privilegedCount = 0
          let hostNetworkCount = 0
          let runAsRootCount = 0
          let noLimitsCount = 0
          const issueDetails: string[] = []

          for (const pod of pods) {
            const ns = pod.metadata?.namespace || 'unknown'
            // Skip system namespaces
            if (ns.startsWith('kube-') || ns === 'gatekeeper-system') continue

            if (pod.spec?.hostNetwork) {
              hostNetworkCount++
              issueDetails.push(`- Pod ${ns}/${pod.metadata?.name}: uses hostNetwork`)
            }

            for (const container of (pod.spec?.containers || [])) {
              if (container.securityContext?.privileged) {
                privilegedCount++
                issueDetails.push(`- Container ${container.name} in ${ns}/${pod.metadata?.name}: runs privileged`)
              }
              if (container.securityContext?.runAsUser === 0 ||
                  (!container.securityContext?.runAsNonRoot && !pod.spec?.securityContext?.runAsNonRoot)) {
                runAsRootCount++
              }
              if (!container.resources?.limits?.cpu || !container.resources?.limits?.memory) {
                noLimitsCount++
              }
            }
          }

          securitySummary = [
            `Privileged containers: ${privilegedCount}`,
            `Host network pods: ${hostNetworkCount}`,
            `Containers potentially running as root: ${runAsRootCount}`,
            ...(issueDetails.length > 0 ? ['', 'Details (first 10):', ...issueDetails.slice(0, 10)] : []),
          ].join('\n')

          resourceLimitsSummary = `Containers without CPU/memory limits: ${noLimitsCount}`
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
    } catch (err) {
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
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnEscape={flow === 'choose'}>
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
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50"
              >
                {installedClusters.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Flow: Choose creation method */}
            {flow === 'choose' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium border-b border-border/50 pb-1">
                  How would you like to create a policy?
                </p>

                {/* Analyze & Suggest */}
                <button
                  onClick={handleAnalyzeAndSuggest}
                  disabled={!selectedCluster || isAnalyzing}
                  className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isAnalyzing
                        ? <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        : <ScanSearch className="w-5 h-5 text-purple-400" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
                        {isAnalyzing ? 'Analyzing cluster...' : 'Analyze Cluster & Suggest Policies'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        AI scans security issues, missing limits, privileged containers and suggests OPA policies to prevent them
                      </p>
                    </div>
                  </div>
                </button>

                {/* Describe What You Need */}
                <button
                  onClick={() => setFlow('describe')}
                  disabled={!selectedCluster}
                  className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <MessageSquareText className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
                        Describe What You Need
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tell AI what you want to enforce and it will generate the policy YAML
                      </p>
                    </div>
                  </div>
                </button>

                {/* From Template */}
                <button
                  onClick={() => setFlow('template')}
                  disabled={!selectedCluster}
                  className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <LayoutTemplate className="w-5 h-5 text-green-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
                        From Template
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Start from a pre-built policy template
                      </p>
                    </div>
                  </div>
                </button>

                {/* Custom YAML */}
                <button
                  onClick={() => setFlow('yaml')}
                  disabled={!selectedCluster}
                  className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <FileCode className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">
                        Custom YAML
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Write or paste ConstraintTemplate + Constraint YAML directly
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Flow: Describe what you need */}
            {flow === 'describe' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Describe the policy you want in plain English. AI will generate the ConstraintTemplate and Constraint YAML.
                </p>
                <textarea
                  value={userDescription}
                  onChange={(e) => setUserDescription(e.target.value)}
                  className="w-full h-32 p-3 bg-secondary/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="e.g., Block all pods that don't have a 'team' label, require all containers to have memory limits, prevent images from untrusted registries..."
                  autoFocus
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleDescribeMission}
                    disabled={!userDescription.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate with AI
                  </button>
                </div>
              </div>
            )}

            {/* Flow: From Template */}
            {flow === 'template' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Choose a template. You can edit the YAML before applying.
                </p>
                {POLICY_TEMPLATES.map(template => (
                  <button
                    key={template.name}
                    onClick={() => handleUseTemplate(template)}
                    className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.kind}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Flow: Custom YAML / Template editor */}
            {flow === 'yaml' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    YAML will be applied to: <span className="text-foreground">{selectedCluster}</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(yamlContent)
                      showToast('Copied to clipboard', 'success')
                    }}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <textarea
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  className="w-full h-[40vh] p-3 bg-secondary/50 border border-border rounded-lg font-mono text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  placeholder="# Paste or write your ConstraintTemplate and Constraint YAML here..."
                  spellCheck={false}
                  autoFocus
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleApplyCustomYaml}
                    disabled={!yamlContent.trim()}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Apply with AI
                  </button>
                </div>
              </div>
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
