import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Shield, AlertTriangle, CheckCircle, ExternalLink, XCircle, Info, ChevronRight, RefreshCw, Plus, Edit3, Trash2, FileCode, LayoutTemplate, Sparkles, Copy } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useClusters } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'

// Sort options for clusters
type SortByOption = 'name' | 'violations' | 'policies'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'violations' as const, label: 'Violations' },
  { value: 'policies' as const, label: 'Policies' },
]

// Violation detail interface
interface Violation {
  name: string
  namespace: string
  kind: string
  policy: string
  message: string
  severity: 'critical' | 'warning' | 'info'
}

// Policy interface for real data
interface Policy {
  name: string
  kind: string // ConstraintTemplate kind
  violations: number
  mode: 'warn' | 'enforce' | 'dryrun' | 'deny'
}

interface OPAPoliciesProps {
  config?: {
    cluster?: string
  }
}

interface GatekeeperStatus {
  cluster: string
  installed: boolean
  policyCount?: number
  violationCount?: number
  mode?: 'dryrun' | 'warn' | 'enforce' | 'deny'
  modes?: ('warn' | 'enforce' | 'dryrun')[]  // All active modes for multi-badge display
  loading: boolean
  error?: string
  policies?: Policy[]
  violations?: Violation[]
}

// Item type for useCardData - enriched cluster with a 'cluster' field for filtering
interface OPAClusterItem {
  name: string
  cluster: string // same as name, required for useCardData cluster filtering
  healthy?: boolean
}

// Common OPA Gatekeeper policy templates
const POLICY_TEMPLATES = [
  {
    name: 'Require Labels',
    description: 'Require specific labels on resources',
    kind: 'K8sRequiredLabels',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequiredlabels
        violation[{"msg": msg}] {
          provided := {label | input.review.object.metadata.labels[label]}
          required := {label | label := input.parameters.labels[_]}
          missing := required - provided
          count(missing) > 0
          msg := sprintf("Missing required labels: %v", [missing])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-team-label
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Namespace"]
  parameters:
    labels: ["team", "owner"]`,
  },
  {
    name: 'Restrict Image Registries',
    description: 'Only allow images from approved registries',
    kind: 'K8sAllowedRepos',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sallowedrepos
spec:
  crd:
    spec:
      names:
        kind: K8sAllowedRepos
      validation:
        openAPIV3Schema:
          type: object
          properties:
            repos:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sallowedrepos
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          satisfied := [good | repo = input.parameters.repos[_]; good = startswith(container.image, repo)]
          not any(satisfied)
          msg := sprintf("Container image %v is not from an allowed registry", [container.image])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sAllowedRepos
metadata:
  name: allowed-repos
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
  parameters:
    repos:
      - "gcr.io/"
      - "docker.io/"`,
  },
  {
    name: 'Require Resource Limits',
    description: 'Require CPU and memory limits on containers',
    kind: 'K8sRequireResourceLimits',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequireresourcelimits
spec:
  crd:
    spec:
      names:
        kind: K8sRequireResourceLimits
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequireresourcelimits
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not container.resources.limits.cpu
          msg := sprintf("Container %v does not have CPU limits", [container.name])
        }
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          not container.resources.limits.memory
          msg := sprintf("Container %v does not have memory limits", [container.name])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequireResourceLimits
metadata:
  name: require-resource-limits
spec:
  enforcementAction: warn
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]`,
  },
  {
    name: 'Block Privileged Containers',
    description: 'Prevent privileged containers from running',
    kind: 'K8sBlockPrivileged',
    template: `apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8sblockprivileged
spec:
  crd:
    spec:
      names:
        kind: K8sBlockPrivileged
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sblockprivileged
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          container.securityContext.privileged == true
          msg := sprintf("Privileged containers are not allowed: %v", [container.name])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sBlockPrivileged
metadata:
  name: block-privileged
spec:
  enforcementAction: deny
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]`,
  },
]

// Module-level flag to prevent StrictMode double-checks
// This persists across component mounts within the same page load
let globalCheckInProgress = false
const globalCheckedClusters = new Set<string>()

async function checkGatekeeperStatus(clusterName: string): Promise<GatekeeperStatus> {
  try {
    // Step 1: Check if gatekeeper-system namespace exists
    const nsResult = await kubectlProxy.exec(
      ['get', 'namespace', 'gatekeeper-system', '--ignore-not-found', '-o', 'name'],
      { context: clusterName, timeout: 15000 }
    )

    if (!nsResult.output || !nsResult.output.includes('gatekeeper-system')) {
      return { cluster: clusterName, installed: false, loading: false }
    }

    // Step 2: Fetch all constraints with violation counts
    const constraintsResult = await kubectlProxy.exec(
      ['get', 'constraints', '-A',
       '-o', 'custom-columns=NAME:.metadata.name,KIND:.kind,ENFORCEMENT:.spec.enforcementAction,VIOLATIONS:.status.totalViolations',
       '--no-headers'],
      { context: clusterName, timeout: 15000 }
    )

    const policies: Policy[] = []
    let totalViolations = 0
    const modes = new Set<string>()

    if (constraintsResult.output) {
      const lines = constraintsResult.output.trim().split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          const name = parts[0]
          const kind = parts[1]
          const enforcement = (parts[2] || 'warn').toLowerCase() as Policy['mode']
          const violations = parseInt(parts[3], 10) || 0

          // Normalize deny to enforce for display
          const normalizedMode = enforcement === 'deny' ? 'enforce' : enforcement as Policy['mode']
          policies.push({
            name,
            kind,
            violations,
            mode: normalizedMode
          })
          totalViolations += violations
          modes.add(normalizedMode)
        }
      }
    }

    // Collect all modes for display (will show multiple badges if mixed)
    const activeModes = Array.from(modes) as ('warn' | 'enforce' | 'dryrun')[]
    // For backward compatibility, pick the most restrictive as primary
    let primaryMode: 'warn' | 'enforce' | 'dryrun' | 'deny' = 'warn'
    if (modes.has('enforce')) {
      primaryMode = 'enforce'
    } else if (modes.has('dryrun')) {
      primaryMode = 'dryrun'
    }

    // Step 3: Fetch some sample violations for display
    const violations: Violation[] = []
    if (totalViolations > 0 && policies.length > 0) {
      // Get violations from the first constraint with violations
      const policyWithViolations = policies.find(p => p.violations > 0)
      if (policyWithViolations) {
        const violationsResult = await kubectlProxy.exec(
          ['get', policyWithViolations.kind.toLowerCase(), policyWithViolations.name,
           '-o', 'jsonpath={.status.violations[*]}'],
          { context: clusterName, timeout: 15000 }
        )

        if (violationsResult.output) {
          try {
            // Parse JSON violations array - the output is space-separated JSON objects
            const violationData = JSON.parse(`[${violationsResult.output.replace(/}\s*{/g, '},{')}]`)
            for (const v of violationData.slice(0, 20)) { // Limit to 20 violations
              violations.push({
                name: v.name || 'Unknown',
                namespace: v.namespace || 'default',
                kind: v.kind || 'Resource',
                policy: policyWithViolations.name,
                message: v.message || 'Policy violation',
                severity: policyWithViolations.mode === 'enforce' || policyWithViolations.mode === 'deny' ? 'critical' : 'warning'
              })
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return {
      cluster: clusterName,
      installed: true,
      loading: false,
      policyCount: policies.length,
      violationCount: totalViolations,
      mode: primaryMode,
      modes: activeModes,
      policies,
      violations
    }
  } catch (err) {
    return { cluster: clusterName, installed: false, loading: false, error: 'Connection failed' }
  }
}


// Policy Detail Modal
function PolicyDetailModal({
  isOpen,
  onClose,
  policy,
  violations,
  onAddPolicy
}: {
  isOpen: boolean
  onClose: () => void
  policy: Policy
  violations: Violation[]
  onAddPolicy: () => void
}) {
  // Get violations for this policy
  const policyViolations = violations.filter(v => v.policy === policy.name)

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'enforce':
      case 'deny':
        return 'text-red-400 bg-red-500/20'
      case 'warn': return 'text-amber-400 bg-amber-500/20'
      default: return 'text-blue-400 bg-blue-500/20'
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={policy.name}
        description={policy.kind}
        icon={Shield}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[50vh]">
        {/* Policy Info */}
        <div className="mb-4 pb-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Enforcement Mode</p>
              <span className={`px-2 py-1 rounded text-sm font-medium ${getModeColor(policy.mode)}`}>
                {policy.mode}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Violations</p>
              <p className={`text-2xl font-bold ${policy.violations > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {policy.violations}
              </p>
            </div>
          </div>
        </div>

        {/* Violations List */}
        {policyViolations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p>No violations for this policy</p>
          </div>
        ) : (
          <div className="space-y-2">
            {policyViolations.map((violation, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{violation.name}</span>
                  <span className="text-xs text-muted-foreground">{violation.kind}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{violation.message}</p>
                <span className="text-xs text-muted-foreground">Namespace: <span className="text-foreground">{violation.namespace}</span></span>
              </div>
            ))}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href={`https://open-policy-agent.github.io/gatekeeper-library/website/${policy.kind.toLowerCase()}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
        >
          Policy Documentation
          <ExternalLink className="w-3 h-3" />
        </a>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onClose()
              onAddPolicy()
            }}
            className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            Create Similar Policy
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

// Tab type for ClusterOPAModal
type OPAModalTab = 'policies' | 'violations'

// Cluster OPA Modal - Full CRUD for OPA policies
function ClusterOPAModal({
  isOpen,
  onClose,
  clusterName,
  policies,
  violations,
  onRefresh,
  startMission
}: {
  isOpen: boolean
  onClose: () => void
  clusterName: string
  policies: Policy[]
  violations: Violation[]
  onRefresh: () => void
  startMission: (mission: {
    title: string
    description: string
    type: 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom'
    cluster: string
    initialPrompt: string
    context?: Record<string, unknown>
  }) => void
}) {
  const [activeTab, setActiveTab] = useState<OPAModalTab>('policies')
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showYamlEditor, setShowYamlEditor] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [yamlContent, setYamlContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)

  // Close create menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    if (showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCreateMenu])

  const severityCounts = {
    critical: violations.filter(v => v.severity === 'critical').length,
    warning: violations.filter(v => v.severity === 'warning').length,
    info: violations.filter(v => v.severity === 'info').length,
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-500/20'
      case 'warning': return 'text-amber-400 bg-amber-500/20'
      default: return 'text-blue-400 bg-blue-500/20'
    }
  }

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'enforce':
      case 'deny':
        return 'text-red-400 bg-red-500/20'
      case 'warn': return 'text-amber-400 bg-amber-500/20'
      default: return 'text-blue-400 bg-blue-500/20'
    }
  }

  // Create policy with AI
  const handleCreateWithAI = () => {
    setShowCreateMenu(false)
    onClose()
    startMission({
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
    })
  }

  // Use a template
  const handleUseTemplate = (template: typeof POLICY_TEMPLATES[0]) => {
    setYamlContent(template.template)
    setEditingPolicy(null)
    setShowTemplateModal(false)
    setShowYamlEditor(true)
  }

  // Edit policy with AI
  const handleEditWithAI = (policy: Policy) => {
    onClose()
    startMission({
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
    })
  }

  // Edit policy YAML directly
  const handleEditYaml = async (policy: Policy) => {
    setEditingPolicy(policy)
    setYamlContent('# Loading policy YAML...\n# Fetching from cluster: ' + clusterName)
    setShowYamlEditor(true)  // Show modal immediately

    // Fetch the current YAML in background
    const cmd = ['get', policy.kind.toLowerCase(), policy.name, '-o', 'yaml']
    console.log('[OPA] Fetching YAML with command:', cmd.join(' '), 'context:', clusterName)

    try {
      // Use priority: true to bypass the queue for immediate execution (interactive user action)
      const result = await kubectlProxy.exec(cmd, { context: clusterName, timeout: 30000, priority: true })
      console.log('[OPA] YAML fetch result:', { hasOutput: !!result.output, outputLength: result.output?.length, error: result.error })

      if (result.output && result.output.trim()) {
        setYamlContent(result.output)
      } else if (result.error) {
        setYamlContent(`# Failed to fetch policy YAML\n# Error: ${result.error}\n\n# You can write new YAML here`)
      } else {
        setYamlContent('# No YAML returned from cluster\n# You can write new YAML here')
      }
    } catch (err) {
      console.error('[OPA] Failed to fetch policy YAML:', err)
      setYamlContent(`# Failed to fetch policy YAML\n# Error: ${err}\n\n# You can write new YAML here`)
    }
  }

  // Apply YAML changes via AI (validates and applies safely)
  const handleApplyYaml = () => {
    const action = editingPolicy ? 'update' : 'create'
    setShowYamlEditor(false)
    onClose()
    startMission({
      title: editingPolicy ? `Apply Policy: ${editingPolicy.name}` : 'Apply OPA Policy',
      description: `Apply OPA Gatekeeper policy YAML to ${clusterName}`,
      type: 'deploy',
      cluster: clusterName,
      initialPrompt: `Please apply the following OPA Gatekeeper policy YAML to cluster "${clusterName}":

\`\`\`yaml
${yamlContent}
\`\`\`

Steps:
1. Review the YAML for any issues
2. Apply it to the cluster using kubectl apply
3. Verify the policy was created/updated successfully
4. Check if there are any immediate violations

Please proceed with applying this policy.`,
      context: { clusterName, action, yaml: yamlContent },
    })
    setYamlContent('')
    setEditingPolicy(null)
  }

  // Toggle enforcement mode
  const handleToggleMode = async (policy: Policy) => {
    const newMode = policy.mode === 'enforce' ? 'warn' : policy.mode === 'warn' ? 'dryrun' : 'enforce'
    try {
      await kubectlProxy.exec(
        ['patch', policy.kind.toLowerCase(), policy.name, '--type=merge', '-p', `{"spec":{"enforcementAction":"${newMode}"}}`],
        { context: clusterName, timeout: 15000 }
      )
      onRefresh()
    } catch (err) {
      console.error('Failed to toggle mode:', err)
    }
  }

  // Delete policy
  const handleDelete = async (policy: Policy) => {
    try {
      await kubectlProxy.exec(
        ['delete', policy.kind.toLowerCase(), policy.name],
        { context: clusterName, timeout: 15000 }
      )
      setDeleteConfirm(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete policy:', err)
    }
  }

  // Disable parent modal's Escape handler when a child modal is open
  const hasChildModalOpen = showTemplateModal || showYamlEditor || !!deleteConfirm

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnEscape={!hasChildModalOpen}>
        <BaseModal.Header
          title="OPA Gatekeeper"
          description={clusterName}
          icon={Shield}
          onClose={onClose}
          showBack={false}
        />

        <BaseModal.Content className="max-h-[60vh]">
          {/* Tabs */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('policies')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeTab === 'policies'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                Policies ({policies.length})
              </button>
              <button
                onClick={() => setActiveTab('violations')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  activeTab === 'violations'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                Violations ({violations.length})
              </button>
            </div>

            {/* Create Policy Button */}
            <div ref={createMenuRef} className="relative">
              <button
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Policy
              </button>
              {showCreateMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={handleCreateWithAI}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-medium">Create with AI</div>
                      <div className="text-xs text-muted-foreground">AI-assisted policy creation</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowCreateMenu(false); setShowTemplateModal(true) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2"
                  >
                    <LayoutTemplate className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-medium">From Template</div>
                      <div className="text-xs text-muted-foreground">Use a pre-built policy</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowCreateMenu(false); setYamlContent(''); setEditingPolicy(null); setShowYamlEditor(true) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2"
                  >
                    <FileCode className="w-4 h-4 text-green-400" />
                    <div>
                      <div className="font-medium">Custom YAML</div>
                      <div className="text-xs text-muted-foreground">Write policy manually</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Policies Tab */}
          {activeTab === 'policies' && (
            <div className="space-y-2">
              {policies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No policies configured</p>
                  <p className="text-xs mt-1">Create a policy to enforce rules on your cluster</p>
                </div>
              ) : (
                policies.map(policy => (
                  <div
                    key={policy.name}
                    onClick={() => handleEditYaml(policy)}
                    className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground group-hover:text-purple-400 transition-colors">{policy.name}</span>
                        <span className="text-xs text-muted-foreground">({policy.kind})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleMode(policy) }}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors hover:opacity-80 ${getModeColor(policy.mode)}`}
                          title="Click to cycle: enforce → warn → dryrun"
                        >
                          {policy.mode}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs">
                        {policy.violations > 0 ? (
                          <span className="flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            {policy.violations} violations
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            No violations
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditWithAI(policy) }}
                          className="p-1.5 rounded hover:bg-secondary text-purple-400 transition-colors"
                          title="Edit with AI"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditYaml(policy) }}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit YAML"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(policy) }}
                          className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Delete policy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Violations Tab */}
          {activeTab === 'violations' && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-border">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                  <p className="text-2xl font-bold text-red-400">{severityCounts.critical}</p>
                  <p className="text-xs text-muted-foreground">Critical</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-2xl font-bold text-amber-400">{severityCounts.warning}</p>
                  <p className="text-xs text-muted-foreground">Warning</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-2xl font-bold text-blue-400">{severityCounts.info}</p>
                  <p className="text-xs text-muted-foreground">Info</p>
                </div>
              </div>

              {/* Violations List */}
              <div className="space-y-2">
                {violations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                    <p className="text-green-400">No violations</p>
                    <p className="text-xs mt-1">All resources comply with policies</p>
                  </div>
                ) : (
                  [...violations]
                    .sort((a, b) => {
                      const severityOrder = { critical: 0, warning: 1, info: 2 }
                      return severityOrder[a.severity] - severityOrder[b.severity]
                    })
                    .map((violation, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(violation.severity)}`}>
                            {violation.severity}
                          </span>
                          <span className="text-sm font-medium text-foreground">{violation.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{violation.kind}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{violation.message}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Namespace: <span className="text-foreground">{violation.namespace}</span></span>
                        <span>Policy: <span className="text-orange-400">{violation.policy}</span></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </BaseModal.Content>

        <BaseModal.Footer>
          <a
            href="https://open-policy-agent.github.io/gatekeeper/website/docs/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            Documentation
            <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </BaseModal.Footer>
      </BaseModal>

      {/* Template Selection Modal */}
      <BaseModal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)} size="md">
        <BaseModal.Header
          title="Policy Templates"
          description="Choose a template to start with"
          icon={LayoutTemplate}
          onClose={() => setShowTemplateModal(false)}
          showBack={false}
        />
        <BaseModal.Content className="max-h-[50vh]">
          <div className="space-y-2">
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
        </BaseModal.Content>
      </BaseModal>

      {/* YAML Editor Modal */}
      <BaseModal isOpen={showYamlEditor} onClose={() => setShowYamlEditor(false)} size="lg">
        <BaseModal.Header
          title={editingPolicy ? `Edit: ${editingPolicy.name}` : 'Create Policy'}
          description="Edit the YAML and apply to cluster"
          icon={FileCode}
          onClose={() => setShowYamlEditor(false)}
          showBack={false}
        />
        <BaseModal.Content className="!overflow-visible">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">YAML will be applied to: <span className="text-foreground">{clusterName}</span></span>
              <button
                onClick={() => navigator.clipboard.writeText(yamlContent)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              className="w-full h-[60vh] p-3 bg-secondary/50 border border-border rounded-lg font-mono text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              placeholder="# Paste or write your ConstraintTemplate and Constraint YAML here..."
              spellCheck={false}
            />
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <button
            onClick={() => setShowYamlEditor(false)}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={handleApplyYaml}
            disabled={!yamlContent.trim() || yamlContent.startsWith('# Loading')}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
        </BaseModal.Footer>
      </BaseModal>

      {/* Delete Confirmation Modal */}
      <BaseModal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} size="sm">
        <BaseModal.Header
          title="Delete Policy"
          description="This action cannot be undone"
          icon={Trash2}
          onClose={() => setDeleteConfirm(null)}
          showBack={false}
        />
        <BaseModal.Content>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the policy <span className="text-foreground font-medium">{deleteConfirm?.name}</span>?
            </p>
            {deleteConfirm && deleteConfirm.violations > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
                <div className="flex items-center gap-2 text-amber-400 mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium">Warning</span>
                </div>
                <p className="text-muted-foreground">
                  This policy has {deleteConfirm.violations} active violations that will be cleared.
                </p>
              </div>
            )}
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Policy
          </button>
        </BaseModal.Footer>
      </BaseModal>
    </>
  )
}

// Sort comparators that use statuses lookup via closure
function createSortComparators(statuses: Record<string, GatekeeperStatus>) {
  return {
    name: commonComparators.string<OPAClusterItem>('name'),
    violations: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.violationCount || 0) - (statuses[b.name]?.violationCount || 0),
    policies: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.policyCount || 0) - (statuses[b.name]?.policyCount || 0),
  }
}

export function OPAPolicies({ config: _config }: OPAPoliciesProps) {
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { startMission } = useMissions()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading,
    hasAnyData: clusters.length > 0,
  })

  // Fetch clusters directly from agent as fallback (skip in demo mode)
  const [agentClusters, setAgentClusters] = useState<{ name: string; healthy?: boolean }[]>([])
  useEffect(() => {
    if (shouldUseDemoData) return
    fetch('http://127.0.0.1:8585/clusters')
      .then(res => res.json())
      .then(data => {
        if (data.clusters) {
          setAgentClusters(data.clusters.map((c: { name: string }) => ({ name: c.name, healthy: true })))
        }
      })
      .catch(() => { /* agent not available */ })
  }, [shouldUseDemoData])

  // Use agent clusters if shared state is empty - memoize for stability
  const effectiveClusters = useMemo(() => {
    return clusters.length > 0 ? clusters : agentClusters
  }, [clusters, agentClusters])

  // Initialize statuses from localStorage cache for instant display
  const [statuses, setStatuses] = useState<Record<string, GatekeeperStatus>>(() => {
    try {
      const cached = localStorage.getItem('opa-statuses-cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        // Check cache age - invalidate after 10 minutes for stale data
        const cacheTime = localStorage.getItem('opa-statuses-cache-time')
        const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime, 10) : Infinity
        if (cacheAge < 10 * 60 * 1000) { // 10 minutes
          console.log('[OPA] Loaded cached statuses for', Object.keys(parsed).length, 'clusters')
          return parsed
        }
      }
    } catch (e) {
      console.error('[OPA] Failed to load cached statuses:', e)
    }
    return {}
  })
  const [, setIsRefreshing] = useState(false)

  // Persist statuses to localStorage when they change (only completed statuses, not loading)
  useEffect(() => {
    // Filter out loading statuses - only cache complete results
    const completedStatuses = Object.fromEntries(
      Object.entries(statuses).filter(([_, s]) => !s.loading)
    )
    if (Object.keys(completedStatuses).length > 0) {
      try {
        localStorage.setItem('opa-statuses-cache', JSON.stringify(completedStatuses))
        localStorage.setItem('opa-statuses-cache-time', Date.now().toString())
      } catch (e) {
        console.error('[OPA] Failed to cache statuses:', e)
      }
    }
  }, [statuses])
  const [showViolationsModal, setShowViolationsModal] = useState(false)
  const [selectedClusterForViolations, setSelectedClusterForViolations] = useState<string>('')
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)

  // Enrich cluster data with 'cluster' field for useCardData compatibility
  // IMPORTANT: Don't filter by healthy status - the agent can reach clusters that browser health checks can't
  // The OPA card uses kubectl via the agent, not browser-based API calls
  const clusterItems = useMemo<OPAClusterItem[]>(() => {
    return effectiveClusters.map(c => ({
      name: c.name,
      cluster: c.name, // useCardData needs this for global + local cluster filtering
      healthy: c.healthy,
    }))
  }, [effectiveClusters])

  // Build sort comparators using current statuses
  const sortComparators = useMemo(
    () => createSortComparators(statuses),
    [statuses]
  )

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: paginatedClusters,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting,
  } = useCardData<OPAClusterItem, SortByOption>(clusterItems, {
    filter: {
      searchFields: ['name'] as (keyof OPAClusterItem)[],
      clusterField: 'cluster' as keyof OPAClusterItem,
      storageKey: 'opa-policies',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: sortComparators,
    },
    defaultLimit: 5,
  })

  // Use ref to avoid recreating checkAllClusters on every status change
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  // Track if we're currently checking to prevent duplicate runs
  const isCheckingRef = useRef(false)

  // Track if initial check has been triggered (using state for reliable persistence)
  const [hasTriggeredInitialCheck, setHasTriggeredInitialCheck] = useState(false)

  // Ref for effectiveClusters to avoid recreating checkAllClusters
  const effectiveClustersRef = useRef(effectiveClusters)
  effectiveClustersRef.current = effectiveClusters

  // Check Gatekeeper on specified clusters
  const checkClusters = useCallback(async (clusters: { name: string }[], forceCheck = false) => {
    if (clusters.length === 0) return

    // In demo mode, kubectlProxy is unavailable — skip real checks
    if (shouldUseDemoData) {
      setIsRefreshing(false)
      return
    }

    if (isCheckingRef.current && !forceCheck) return // Prevent duplicate runs
    if (globalCheckInProgress && !forceCheck) return

    // Filter out clusters already being checked globally (for StrictMode double-mount)
    const clustersToCheck = forceCheck
      ? clusters
      : clusters.filter(c => !globalCheckedClusters.has(c.name))

    if (clustersToCheck.length === 0) return

    isCheckingRef.current = true
    globalCheckInProgress = true
    setIsRefreshing(true)

    // Mark clusters as being checked globally
    for (const cluster of clustersToCheck) {
      globalCheckedClusters.add(cluster.name)
    }

    // Immediately mark all clusters as "loading" to prevent duplicate checks on remount
    setStatuses(prev => {
      const updated = { ...prev }
      for (const cluster of clustersToCheck) {
        // Only set loading if not already checked
        if (!updated[cluster.name] || updated[cluster.name].loading) {
          updated[cluster.name] = { cluster: cluster.name, installed: false, loading: true }
        }
      }
      return updated
    })

    try {
      // Check clusters sequentially to avoid overwhelming the kubectlProxy queue
      for (const cluster of clustersToCheck) {
        try {
          const status = await checkGatekeeperStatus(cluster.name)
          // Update status immediately after each cluster check
          setStatuses(prev => ({ ...prev, [cluster.name]: status }))
        } catch (err) {
          setStatuses(prev => ({
            ...prev,
            [cluster.name]: { cluster: cluster.name, installed: false, loading: false, error: String(err) }
          }))
        }
        // Remove from global set after check completes
        globalCheckedClusters.delete(cluster.name)
      }
    } finally {
      setIsRefreshing(false)
      isCheckingRef.current = false
      globalCheckInProgress = false
    }
  }, [shouldUseDemoData])

  // Wrapper for manual refresh - uses current effective clusters, force check to override guards
  const handleRefresh = useCallback(() => {
    checkClusters(effectiveClustersRef.current, true)
  }, [checkClusters])

  // Initial check - only check clusters without cached data
  // Skip if we've already triggered a check this session
  useEffect(() => {
    if (hasTriggeredInitialCheck) return
    if (effectiveClusters.length === 0) return

    // Check sessionStorage to see if we've already done initial check this session
    const sessionKey = 'opa-initial-check-done'
    const alreadyCheckedThisSession = sessionStorage.getItem(sessionKey) === 'true'

    setHasTriggeredInitialCheck(true)

    // Find clusters without any status (neither cached data nor loading state)
    // Clusters with loading:true are already being checked, don't duplicate
    const uncachedClusters = effectiveClusters.filter(c => !statuses[c.name])

    if (uncachedClusters.length === 0) {
      return
    }

    if (alreadyCheckedThisSession && uncachedClusters.length < effectiveClusters.length) {
      checkClusters(uncachedClusters)
    } else {
      sessionStorage.setItem(sessionKey, 'true')
      checkClusters(effectiveClusters)
    }
  }, [hasTriggeredInitialCheck, effectiveClusters, statuses, checkClusters])

  const handleInstallOPA = (clusterName: string) => {
    startMission({
      title: `Install OPA Gatekeeper on ${clusterName}`,
      description: 'Set up OPA Gatekeeper for policy enforcement',
      type: 'deploy',
      cluster: clusterName,
      initialPrompt: `I want to install OPA Gatekeeper on the cluster "${clusterName}".

Please help me:
1. Check if Gatekeeper is already installed
2. If not, install it using the official Helm chart or manifests
3. Verify the installation is working
4. Set up a basic policy (like requiring labels)

Please proceed step by step.`,
      context: { clusterName },
    })
  }

  const installedCount = Object.values(statuses).filter(s => s.installed).length
  const totalViolations = Object.values(statuses)
    .filter(s => s.installed)
    .reduce((sum, s) => sum + (s.violationCount || 0), 0)

  const handleShowViolations = (clusterName: string) => {
    setSelectedClusterForViolations(clusterName)
    setShowViolationsModal(true)
  }

  const handleAddPolicy = (basedOnPolicy?: string) => {
    // Get the first installed cluster, or use a default
    const installedCluster = Object.entries(statuses).find(([_, s]) => s.installed)?.[0] || 'default'

    startMission({
      title: 'Create OPA Gatekeeper Policy',
      description: basedOnPolicy
        ? `Create a policy similar to ${basedOnPolicy}`
        : 'Create a new OPA Gatekeeper policy',
      type: 'deploy',
      cluster: installedCluster,
      initialPrompt: basedOnPolicy
        ? `I want to create a new OPA Gatekeeper policy similar to "${basedOnPolicy}".

Please help me:
1. Explain what the ${basedOnPolicy} policy does
2. Ask me what modifications I want to make
3. Generate a ConstraintTemplate and Constraint for my requirements
4. Help me apply it to the cluster
5. Test that the policy is working

Let's start by discussing what kind of policy I need.`
        : `I want to create a new OPA Gatekeeper policy for my Kubernetes cluster.

Please help me:
1. Ask me what kind of policy I want to enforce (e.g., require labels, restrict images, enforce resource limits)
2. Generate the appropriate ConstraintTemplate and Constraint
3. Help me apply it to the cluster
4. Test that the policy is working

Let's start by discussing what kind of policy I need.`,
      context: { basedOnPolicy },
    })
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        {installedCount > 0 ? (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">
            {installedCount} cluster{installedCount !== 1 ? 's' : ''}
          </span>
        ) : <div />}
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          extra={
            <a
              href="https://open-policy-agent.github.io/gatekeeper/website/docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
              title="OPA Gatekeeper Documentation"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          }
        />
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search clusters..."
        className="mb-3"
      />

      {/* Summary stats */}
      {installedCount > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-[10px] text-orange-400">Policies Active</p>
            <p className="text-lg font-bold text-foreground">
              {Object.values(statuses).filter(s => s.installed).reduce((sum, s) => sum + (s.policyCount || 0), 0)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-[10px] text-red-400">Violations</p>
            <p className="text-lg font-bold text-foreground">{totalViolations}</p>
          </div>
        </div>
      )}

      {/* Cluster list - p-1 -m-1 gives room for focus rings without clipping */}
      <div className="flex-1 overflow-y-auto space-y-2 p-1 -m-1">
        {paginatedClusters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No clusters available
          </div>
        ) : (
          paginatedClusters.map(cluster => {
            const status = statuses[cluster.name]
            // Only show loading spinner for initial check (no cached data or loading state)
            // During refresh, show cached data - the refresh button spinner indicates activity
            const isInitialLoading = !status || status.loading

            return (
              <button
                key={cluster.name}
                onClick={() => status?.installed && handleShowViolations(cluster.name)}
                disabled={!status?.installed || isInitialLoading}
                className={`w-full text-left p-2.5 rounded-lg bg-secondary/30 transition-colors ${
                  status?.installed && !isInitialLoading
                    ? 'hover:bg-secondary/50 cursor-pointer group'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium text-foreground ${status?.installed ? 'group-hover:text-purple-400' : ''}`}>
                    {cluster.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {isInitialLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    ) : status?.installed ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </>
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isInitialLoading ? (
                  <p className="text-xs text-muted-foreground">Checking...</p>
                ) : status?.installed ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {status.policyCount} {status.policyCount === 1 ? 'policy' : 'policies'}
                      </span>
                      {status.violationCount! > 0 && (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          {status.violationCount} {status.violationCount === 1 ? 'violation' : 'violations'}
                        </span>
                      )}
                      {(status.modes && status.modes.length > 1 ? status.modes : [status.mode]).map((mode, idx) => (
                        <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] ${
                          mode === 'enforce' ? 'bg-red-500/20 text-red-400' :
                          mode === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {mode}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Not installed</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleInstallOPA(cluster.name)
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
                    >
                      Install with AI →
                    </span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage === 'unlimited' ? totalItems : itemsPerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* Active policies preview - show real policies from first cluster with policies */}
      {installedCount > 0 && (() => {
        const clusterWithPolicies = Object.values(statuses).find(s => s.installed && s.policies && s.policies.length > 0)
        const policies = clusterWithPolicies?.policies || []
        if (policies.length === 0) return null

        return (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Active Policies
            </p>
            <div className="space-y-1">
              {policies.slice(0, 4).map(policy => (
                <button
                  key={policy.name}
                  onClick={() => {
                    setSelectedPolicy(policy)
                    setShowPolicyModal(true)
                  }}
                  className="w-full flex items-center justify-between text-xs p-1.5 -mx-1.5 rounded hover:bg-secondary/50 transition-colors group"
                >
                  <span className="text-foreground truncate group-hover:text-purple-400">{policy.name}</span>
                  <div className="flex items-center gap-2">
                    {policy.violations > 0 && (
                      <span className="text-amber-400">{policy.violations.toLocaleString()}</span>
                    )}
                    <span className={`px-1 py-0.5 rounded text-[9px] ${
                      policy.mode === 'enforce' || policy.mode === 'deny' ? 'bg-red-500/20 text-red-400' :
                      policy.mode === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {policy.mode}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <a
          href="https://open-policy-agent.github.io/gatekeeper/website/docs/install"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Install Guide
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://open-policy-agent.github.io/gatekeeper-library/website/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Policy Library
        </a>
      </div>

      {/* Cluster OPA Modal - Full CRUD */}
      <ClusterOPAModal
        isOpen={showViolationsModal}
        onClose={() => setShowViolationsModal(false)}
        clusterName={selectedClusterForViolations}
        policies={statuses[selectedClusterForViolations]?.policies || []}
        violations={statuses[selectedClusterForViolations]?.violations || []}
        onRefresh={handleRefresh}
        startMission={startMission}
      />

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <PolicyDetailModal
          isOpen={showPolicyModal}
          onClose={() => {
            setShowPolicyModal(false)
            setSelectedPolicy(null)
          }}
          policy={selectedPolicy}
          violations={Object.values(statuses).flatMap(s => s.violations || [])}
          onAddPolicy={() => handleAddPolicy(selectedPolicy.name)}
        />
      )}
    </div>
  )
}
