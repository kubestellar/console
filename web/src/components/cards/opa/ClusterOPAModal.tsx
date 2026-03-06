import { useState, useEffect, useRef } from 'react'
import { Shield, AlertTriangle, CheckCircle, ExternalLink, Plus, Edit3, Trash2, FileCode, LayoutTemplate, Sparkles, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { useToast } from '../../ui/Toast'
import type { Policy, Violation, StartMissionFn } from './types'
import { POLICY_TEMPLATES } from './types'

// Tab type for ClusterOPAModal
type OPAModalTab = 'policies' | 'violations'

// Cluster OPA Modal - Full CRUD for OPA policies
export function ClusterOPAModal({
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
  startMission: StartMissionFn
}) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
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

    try {
      // Use priority: true to bypass the queue for immediate execution (interactive user action)
      const result = await kubectlProxy.exec(cmd, { context: clusterName, timeout: 30000, priority: true })

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
      showToast('Policy mode updated successfully', 'success')
      onRefresh()
    } catch (err) {
      console.error('Failed to toggle mode:', err)
      showToast('Failed to toggle policy mode', 'error')
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
      showToast('Policy deleted successfully', 'success')
      onRefresh()
    } catch (err) {
      console.error('Failed to delete policy:', err)
      showToast('Failed to delete policy', 'error')
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
                  <p>{t('messages.noPoliciesConfigured')}</p>
                  <p className="text-xs mt-1">{t('messages.createPolicyPrompt')}</p>
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
                  <p className="text-xs text-muted-foreground">{t('common:common.critical')}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-2xl font-bold text-amber-400">{severityCounts.warning}</p>
                  <p className="text-xs text-muted-foreground">{t('common:common.warning')}</p>
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
                  <span className="font-medium">{t('common:common.warning')}</span>
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
