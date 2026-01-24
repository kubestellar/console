/**
 * Cards for open source data compliance tools:
 * - HashiCorp Vault: Secrets management and encryption
 * - External Secrets Operator: Kubernetes secrets synchronization
 * - Cert-Manager: TLS certificate lifecycle management
 */

import { Key, Lock, Shield, RefreshCw, CheckCircle2, AlertTriangle, Clock, ExternalLink, AlertCircle } from 'lucide-react'

interface CardConfig {
  config?: Record<string, unknown>
}

// HashiCorp Vault - Secrets Management Card
export function VaultSecrets({ config: _config }: CardConfig) {
  const demoData = {
    status: 'unsealed',
    secrets: 156,
    dynamicCredentials: 23,
    leases: 45,
    policies: 12,
    authMethods: ['kubernetes', 'ldap', 'approle'],
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Key className="w-4 h-4 text-yellow-400" />
          <span>HashiCorp Vault</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            demoData.status === 'unsealed'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {demoData.status}
          </span>
          <a
            href="https://www.vaultproject.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-yellow-400"
            title="Vault Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 font-medium">Vault Integration</p>
          <p className="text-muted-foreground">
            Install Vault for secrets management.{' '}
            <a
              href="https://developer.hashicorp.com/vault/docs/platform/k8s"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{demoData.secrets}</p>
          <p className="text-xs text-muted-foreground">Secrets</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{demoData.dynamicCredentials}</p>
          <p className="text-xs text-muted-foreground">Dynamic Creds</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{demoData.leases}</p>
          <p className="text-xs text-muted-foreground">Active Leases</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 text-center">
          <p className="text-lg font-bold text-foreground">{demoData.policies}</p>
          <p className="text-xs text-muted-foreground">Policies</p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium">Auth: </span>
        {demoData.authMethods.join(', ')}
      </div>
    </div>
  )
}

// External Secrets Operator Card
export function ExternalSecrets({ config: _config }: CardConfig) {
  const demoData = {
    totalSecrets: 89,
    synced: 85,
    failed: 2,
    pending: 2,
    providers: [
      { name: 'AWS Secrets Manager', count: 34 },
      { name: 'HashiCorp Vault', count: 28 },
      { name: 'Azure Key Vault', count: 15 },
      { name: 'GCP Secret Manager', count: 12 },
    ],
  }

  const syncRate = Math.round((demoData.synced / demoData.totalSecrets) * 100)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 text-blue-400" />
          <span>External Secrets</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400 font-medium">{syncRate}% synced</span>
          <a
            href="https://external-secrets.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-blue-400"
            title="External Secrets Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">External Secrets Integration</p>
          <p className="text-muted-foreground">
            Install ESO for secrets synchronization.{' '}
            <a
              href="https://external-secrets.io/latest/introduction/getting-started/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${syncRate}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-2 rounded-lg bg-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{demoData.synced}</p>
          <p className="text-muted-foreground">Synced</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <AlertTriangle className="w-4 h-4 text-red-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{demoData.failed}</p>
          <p className="text-muted-foreground">Failed</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10">
          <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="font-medium text-foreground">{demoData.pending}</p>
          <p className="text-muted-foreground">Pending</p>
        </div>
      </div>

      <div className="space-y-1">
        {demoData.providers.slice(0, 3).map((provider, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">{provider.name}</span>
            <span className="font-medium text-foreground">{provider.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Cert-Manager TLS Certificates Card
export function CertManager({ config: _config }: CardConfig) {
  const demoData = {
    total: 67,
    valid: 62,
    expiringSoon: 3,
    expired: 2,
    issuers: [
      { name: "Let's Encrypt", type: 'ClusterIssuer', certs: 45 },
      { name: 'Internal CA', type: 'Issuer', certs: 22 },
    ],
    renewals24h: 5,
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="w-4 h-4 text-green-400" />
          <span>Cert-Manager</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {demoData.renewals24h} renewals/24h
          </span>
          <a
            href="https://cert-manager.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-green-400"
            title="Cert-Manager Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-green-400 font-medium">Cert-Manager Integration</p>
          <p className="text-muted-foreground">
            Install cert-manager for TLS automation.{' '}
            <a
              href="https://cert-manager.io/docs/installation/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:underline"
            >
              Install guide →
            </a>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
        <div className="p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-400">{demoData.valid}</p>
          <p className="text-muted-foreground">Valid</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10">
          <p className="text-lg font-bold text-yellow-400">{demoData.expiringSoon}</p>
          <p className="text-muted-foreground">Expiring</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <p className="text-lg font-bold text-red-400">{demoData.expired}</p>
          <p className="text-muted-foreground">Expired</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-lg font-bold text-foreground">{demoData.total}</p>
          <p className="text-muted-foreground">Total</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Issuers</p>
        {demoData.issuers.map((issuer, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-foreground">{issuer.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{issuer.type}</span>
              <span className="text-xs font-medium text-foreground">{issuer.certs}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
