import { useState } from 'react'
import { useCardLoadingState } from './CardDataContext'

interface Webhook {
  name: string
  type: 'mutating' | 'validating'
  failurePolicy: 'Fail' | 'Ignore'
  matchPolicy: string
  rules: number
  cluster: string
}

const DEMO_WEBHOOKS: Webhook[] = [
  { name: 'gatekeeper-validating', type: 'validating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 3, cluster: 'prod-us-east' },
  { name: 'kyverno-resource-validating', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Equivalent', rules: 12, cluster: 'prod-us-east' },
  { name: 'cert-manager-webhook', type: 'mutating', failurePolicy: 'Fail', matchPolicy: 'Exact', rules: 2, cluster: 'prod-us-east' },
  { name: 'istio-sidecar-injector', type: 'mutating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 1, cluster: 'prod-us-east' },
  { name: 'vault-agent-injector', type: 'mutating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 1, cluster: 'prod-eu-west' },
  { name: 'gatekeeper-validating', type: 'validating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 5, cluster: 'prod-eu-west' },
  { name: 'kyverno-resource-validating', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Equivalent', rules: 8, cluster: 'staging' },
  { name: 'webhook-admission-controller', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Exact', rules: 4, cluster: 'staging' },
]

export function AdmissionWebhooks() {
  const [tab, setTab] = useState<'all' | 'mutating' | 'validating'>('all')
  useCardLoadingState({ isLoading: false, hasAnyData: true, isDemoData: true })

  const webhooks = DEMO_WEBHOOKS
  const filtered = tab === 'all' ? webhooks : webhooks.filter(w => w.type === tab)
  const mutatingCount = webhooks.filter(w => w.type === 'mutating').length
  const validatingCount = webhooks.filter(w => w.type === 'validating').length

  return (
    <div className="space-y-2 p-1">
      <div className="flex gap-2 items-center">
        {(['all', 'mutating', 'validating'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {t === 'all' ? `All (${webhooks.length})` : t === 'mutating' ? `Mutating (${mutatingCount})` : `Validating (${validatingCount})`}
          </button>
        ))}
      </div>

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filtered.map((wh, i) => (
          <div key={`${wh.cluster}-${wh.name}-${i}`} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  wh.type === 'mutating' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {wh.type === 'mutating' ? 'M' : 'V'}
                </span>
                <span className="text-sm font-medium truncate">{wh.name}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{wh.cluster} · {wh.rules} rules</div>
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
              wh.failurePolicy === 'Fail' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {wh.failurePolicy}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
