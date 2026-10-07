import { useState, useEffect, useRef } from 'react'
import { Shield, ExternalLink, Plus, FileCode, LayoutTemplate, Sparkles, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { BaseModal, useModalState } from '../../../lib/modals'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { useToast } from '../../ui/Toast'
import type { Policy, Violation, StartMissionFn } from './types'
import { POLICY_TEMPLATES } from './types'
import { copyToClipboard } from '../../../lib/clipboard'
import { KUBECTL_MEDIUM_TIMEOUT_MS, KUBECTL_EXTENDED_TIMEOUT_MS } from '../../../lib/constants/network'
import { OPAPoliciesTab, OPAViolationsTab } from './ClusterOPAModal.tabs'
import { OPATemplatePickerModal, OPADeletePolicyModal } from './ClusterOPAModal.dialogs'

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
  const { isOpen: showTemplateModal, open: openTemplateModal, close: closeTemplateModal } = useModalState()
  const [showYamlEditor, setShowYamlEditor] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [yamlContent, setYamlContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null)
  const [togglingPolicyId, setTogglingPolicyId] = useState<string | null>(null)
  const [isDeletingPolicy, setIsDeletingPolicy] = useState(false)
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
    closeTemplateModal()
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
      const result = await kubectlProxy.exec(cmd, { context: clusterName, timeout: KUBECTL_EXTENDED_TIMEOUT_MS, priority: true })

      if (result.output && result.output.trim()) {
        setYamlContent(result.output)
      } else if (result.error) {
        setYamlContent(`# Failed to fetch policy YAML\n# Error: ${result.error}\n\n# You can write new YAML here`)
      } else {
        setYamlContent('# No YAML returned from cluster\n# You can write new YAML here')
      }
    } catch (err: unknown) {
      console.error('[OPA] Failed to fetch policy YAML:', err)
      setYamlContent(`# Failed to fetch policy YAML\n# Error: ${err}\n\n# You can write new YAML here`)
      showToast(t('common:errors.fetchPolicyFailed', { defaultValue: 'Failed to fetch policy YAML from cluster' }), 'error')
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
    if (togglingPolicyId) return
    const newMode = policy.mode === 'enforce' ? 'warn' : policy.mode === 'warn' ? 'dryrun' : 'enforce'
    setTogglingPolicyId(policy.name)
    try {
      await kubectlProxy.exec(
        ['patch', policy.kind.toLowerCase(), policy.name, '--type=merge', '-p', `{"spec":{"enforcementAction":"${newMode}"}}`],
        { context: clusterName, timeout: KUBECTL_MEDIUM_TIMEOUT_MS }
      )
      showToast('Policy mode updated successfully', 'success')
      onRefresh()
    } catch (err: unknown) {
      console.error('Failed to toggle mode:', err)
      showToast('Failed to toggle policy mode', 'error')
    } finally {
      setTogglingPolicyId(null)
    }
  }

  // Delete policy
  const handleDelete = async (policy: Policy) => {
    setIsDeletingPolicy(true)
    try {
      await kubectlProxy.exec(
        ['delete', policy.kind.toLowerCase(), policy.name],
        { context: clusterName, timeout: KUBECTL_MEDIUM_TIMEOUT_MS }
      )
      setDeleteConfirm(null)
      showToast('Policy deleted successfully', 'success')
      onRefresh()
    } catch (err: unknown) {
      console.error('Failed to delete policy:', err)
      showToast('Failed to delete policy', 'error')
    } finally {
      setIsDeletingPolicy(false)
    }
  }

  // Disable parent modal's Escape handler when a child modal is open
  const hasChildModalOpen = showTemplateModal || showYamlEditor || !!deleteConfirm

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnEscape={!hasChildModalOpen} closeOnBackdrop={false}>
        <BaseModal.Header
          title="OPA Gatekeeper"
          description={clusterName}
          icon={Shield}
          onClose={onClose}
          showBack={false}
        />

        <BaseModal.Content className="max-h-[60vh]">
          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4 pb-3 border-b border-border">
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
              <Button
                variant="accent"
                size="md"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowCreateMenu(!showCreateMenu)}
              >
                Create Policy
              </Button>
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
                    onClick={() => { setShowCreateMenu(false); openTemplateModal() }}
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
            <OPAPoliciesTab
              policies={policies}
              togglingPolicyId={togglingPolicyId}
              onEditYaml={handleEditYaml}
              onEditWithAI={handleEditWithAI}
              onToggleMode={handleToggleMode}
              onRequestDelete={setDeleteConfirm}
            />
          )}

          {/* Violations Tab */}
          {activeTab === 'violations' && (
            <OPAViolationsTab violations={violations} />
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
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
          >
            Close
          </Button>
        </BaseModal.Footer>
      </BaseModal>

      {/* Template Selection Modal */}
      <OPATemplatePickerModal
        isOpen={showTemplateModal}
        onClose={closeTemplateModal}
        onSelectTemplate={handleUseTemplate}
      />

      {/* YAML Editor Modal */}
      <BaseModal isOpen={showYamlEditor} onClose={() => setShowYamlEditor(false)} size="lg">
        <BaseModal.Header
          title={editingPolicy ? `Edit: ${editingPolicy.name}` : 'Create Policy'}
          description="Edit the YAML and apply to cluster"
          icon={FileCode}
          onClose={() => setShowYamlEditor(false)}
          showBack={false}
        />
        <BaseModal.Content className="overflow-visible">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-y-2 text-xs">
              <span className="text-muted-foreground">YAML will be applied to: <span className="text-foreground">{clusterName}</span></span>
              <button
                onClick={() => copyToClipboard(yamlContent)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              className="w-full h-[60vh] p-3 bg-secondary/50 border border-border rounded-lg font-mono text-sm text-foreground resize-none focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
              placeholder="# Paste or write your ConstraintTemplate and Constraint YAML here..."
              spellCheck={false}
            />
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setShowYamlEditor(false)}
          >
            Cancel
          </Button>
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
      <OPADeletePolicyModal
        policy={deleteConfirm}
        isDeleting={isDeletingPolicy}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}
