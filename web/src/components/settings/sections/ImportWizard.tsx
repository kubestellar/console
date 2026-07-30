import { AlertCircle } from 'lucide-react'
import type { TFunction } from 'i18next'

interface ImportWizardProps {
  t: TFunction
}

export function ImportWizard({ t }: ImportWizardProps) {
  return (
    <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
      <div className="flex items-center gap-2 text-orange-400">
        <AlertCircle className="w-5 h-5" />
        <span className="font-medium">{t('settings.localClusters.noToolsDetected')}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('settings.localClusters.installTools')}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li><code className="px-1 bg-secondary rounded">brew install kind</code> - Kubernetes in Docker</li>
        <li><code className="px-1 bg-secondary rounded">brew install k3d</code> - k3s in Docker</li>
        <li><code className="px-1 bg-secondary rounded">brew install minikube</code> - Local VM/container clusters</li>
      </ul>
    </div>
  )
}
