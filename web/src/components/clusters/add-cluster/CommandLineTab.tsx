import { useTranslation } from 'react-i18next'
import { CloudProviderIcon } from '../../ui/CloudProviderIcon'
import { StatusBadge } from '../../ui/StatusBadge'
import { CopyButton } from './CopyButton'
import type { CloudProvider, CloudCLIInfo } from './types'

const EXAMPLE_SERVER_URL = 'https://<api-server>:6443' // SECURITY: Safe — template placeholder, not a real endpoint

const COMMANDS = [
  {
    comment: '# 1. Add cluster credentials',
    command: `kubectl config set-cluster <cluster-name> --server=${EXAMPLE_SERVER_URL}`,
  },
  {
    comment: '# 2. Add authentication',
    command: 'kubectl config set-credentials <user-name> --token=<your-token>',
  },
  {
    comment: '# 3. Create a context',
    command: 'kubectl config set-context <context-name> --cluster=<cluster-name> --user=<user-name>',
  },
  {
    comment: '# 4. Switch to the new context (optional)',
    command: 'kubectl config use-context <context-name>',
  },
]

// Cloud provider IAM auth commands — two steps: authenticate, then register cluster
const CLOUD_IAM_COMMANDS: Record<CloudProvider, { auth: string; register: string; cliName: string }> = {
  eks: {
    cliName: 'aws',
    auth: 'aws sso login',
    register: 'aws eks update-kubeconfig --name <CLUSTER> --region <REGION>',
  },
  gke: {
    cliName: 'gcloud',
    auth: 'gcloud auth login',
    register: 'gcloud container clusters get-credentials <CLUSTER> --zone <ZONE> --project <PROJECT>',
  },
  aks: {
    cliName: 'az',
    auth: 'az login',
    register: 'az aks get-credentials --resource-group <RG> --name <CLUSTER>',
  },
  openshift: {
    cliName: 'oc',
    auth: 'oc login <API_SERVER_URL>',
    register: '', // oc login already sets up kubeconfig
  },
}

interface CommandLineTabProps {
  cloudCLIs: CloudCLIInfo[]
}

export function CommandLineTab({ cloudCLIs }: CommandLineTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Cloud Quick Connect — shows detected cloud CLIs */}
      {cloudCLIs.some(c => c.found) && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{t('cluster.cloudQuickConnect')}</h3>
          <p className="text-xs text-muted-foreground">{t('cluster.cloudQuickConnectDesc')}</p>
          <div className="grid grid-cols-1 gap-2">
            {cloudCLIs.filter(c => c.found).map(cli => {
              const providerKey = cli.name === 'aws' ? 'eks' : cli.name === 'gcloud' ? 'gke' : cli.name === 'az' ? 'aks' : 'openshift'
              const cmds = CLOUD_IAM_COMMANDS[providerKey as CloudProvider]
              return (
                <div key={cli.name} className="bg-secondary rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CloudProviderIcon provider={providerKey} size={16} />
                    <span className="text-sm font-medium text-foreground">{cli.provider}</span>
                    <StatusBadge color="green" size="xs">detected</StatusBadge>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <code className="text-xs text-muted-foreground font-mono break-all">{cmds.register || cmds.auth}</code>
                    <CopyButton text={cmds.register || cmds.auth} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="border-t border-border dark:border-white/10" />
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t('cluster.addClusterCommandLineDesc')}
      </p>

      {COMMANDS.map((cmd, i) => (
        <div key={i} className="bg-secondary rounded-lg p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 font-mono text-sm overflow-x-auto">
              <div className="text-muted-foreground">{cmd.comment}</div>
              <div className="text-foreground mt-1">{cmd.command}</div>
            </div>
            <CopyButton text={cmd.command} />
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border/30 dark:border-white/5">
        {t('cluster.addClusterAutoDetect')}
      </p>
    </div>
  )
}
