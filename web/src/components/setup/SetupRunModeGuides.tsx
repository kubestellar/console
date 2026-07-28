import { useTranslation } from 'react-i18next'
import { emitInstallCommandCopied } from '../../lib/analytics'
import { CopyableCommand } from './SetupInstructionsParts'
import { DEV_MODE_CMD, DEV_MODE_STEP_KEY, K8S_DEPLOY_CMD, K8S_DEPLOY_STEP_KEY } from './setupInstructions.constants'

/** Body of the "Or run from source" disclosure. */
export function SetupDevModeGuide({
  copiedStep,
  onCopy,
}: {
  copiedStep: number | null
  onCopy: (text: string, stepKey: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
      <CopyableCommand
        command={DEV_MODE_CMD}
        isCopied={copiedStep === DEV_MODE_STEP_KEY}
        copyTitle={t('drilldown.tooltips.copyCommand')}
        onCopy={() => {
          onCopy(DEV_MODE_CMD, DEV_MODE_STEP_KEY)
          emitInstallCommandCopied('setup_dev_mode', DEV_MODE_CMD)
        }}
      />
      <p className="text-xs text-muted-foreground">
        Requires Go 1.25+ and Node.js 20+. Compiles from source and starts a Vite dev server on port 5174.
      </p>
    </div>
  )
}

/** Body of the "Or deploy to a Kubernetes cluster" disclosure. */
export function SetupK8sDeployGuide({
  copiedStep,
  onCopy,
}: {
  copiedStep: number | null
  onCopy: (text: string, stepKey: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        One command — requires <code className="font-mono text-foreground/70">helm</code> and <code className="font-mono text-foreground/70">kubectl</code>
      </p>
      <CopyableCommand
        command={K8S_DEPLOY_CMD}
        isCopied={copiedStep === K8S_DEPLOY_STEP_KEY}
        copyTitle={t('drilldown.tooltips.copyCommand')}
        onCopy={() => {
          onCopy(K8S_DEPLOY_CMD, K8S_DEPLOY_STEP_KEY)
          emitInstallCommandCopied('setup_k8s_deploy', K8S_DEPLOY_CMD)
        }}
      />
      <p className="text-xs text-muted-foreground">
        Supports <code className="font-mono text-foreground/70">--context</code>, <code className="font-mono text-foreground/70">--openshift</code>, <code className="font-mono text-foreground/70">--ingress &lt;host&gt;</code>, and <code className="font-mono text-foreground/70">--github-oauth</code> flags.
      </p>
    </div>
  )
}
