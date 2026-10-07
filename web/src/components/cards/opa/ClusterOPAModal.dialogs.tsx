// Template picker and delete-confirmation dialogs for the OPA Gatekeeper
// cluster modal. Extracted from ClusterOPAModal.tsx (issue #24058) — markup unchanged.
import { AlertTriangle, LayoutTemplate, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { BaseModal } from '../../../lib/modals'
import type { Policy } from './types'
import { POLICY_TEMPLATES } from './types'

interface OPATemplatePickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectTemplate: (template: typeof POLICY_TEMPLATES[0]) => void
}

export function OPATemplatePickerModal({ isOpen, onClose, onSelectTemplate }: OPATemplatePickerModalProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="Policy Templates"
        description="Choose a template to start with"
        icon={LayoutTemplate}
        onClose={onClose}
        showBack={false}
      />
      <BaseModal.Content className="max-h-[50vh]">
        <div className="space-y-2">
          {POLICY_TEMPLATES.map(template => (
            <button
              key={template.name}
              onClick={() => onSelectTemplate(template)}
              className="w-full p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
                <span className="text-sm font-medium text-foreground">{template.name}</span>
                <span className="text-xs text-muted-foreground">{template.kind}</span>
              </div>
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </button>
          ))}
        </div>
      </BaseModal.Content>
    </BaseModal>
  )
}

interface OPADeletePolicyModalProps {
  policy: Policy | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: (policy: Policy) => void
}

export function OPADeletePolicyModal({ policy, isDeleting, onCancel, onConfirm }: OPADeletePolicyModalProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <BaseModal isOpen={!!policy} onClose={onCancel} size="sm">
      <BaseModal.Header
        title="Delete Policy"
        description="This action cannot be undone"
        icon={Trash2}
        onClose={onCancel}
        showBack={false}
      />
      <BaseModal.Content>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the policy <span className="text-foreground font-medium">{policy?.name}</span>?
          </p>
          {policy && policy.violations > 0 && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
              <div className="flex items-center gap-2 text-yellow-400 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">{t('common:common.warning')}</span>
              </div>
              <p className="text-muted-foreground">
                This policy has {policy.violations} active violations that will be cleared.
              </p>
            </div>
          )}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <Button
          variant="ghost"
          size="lg"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <div className="flex-1" />
        <button
          onClick={() => policy && onConfirm(policy)}
          disabled={isDeleting}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {isDeleting ? 'Deleting...' : 'Delete Policy'}
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
