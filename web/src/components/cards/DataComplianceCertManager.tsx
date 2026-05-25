import { Shield, AlertCircle } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { useCertManager } from '../../hooks/useCertManager'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface CardConfig {
  config?: Record<string, unknown>
}

export function CertManager({ config: _config }: CardConfig) {
  const { t } = useTranslation()
  const { status, issuers, isLoading, isRefreshing, isDemoData, consecutiveFailures, isFailed } = useCertManager()
  const hasData = issuers.length > 0 || status.installed

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
  })

  if (!isLoading && !status.installed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">Cert-Manager Integration</p>
            <p className="text-muted-foreground">
              Install cert-manager for TLS automation.{" "}
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
        <p className="text-xs text-muted-foreground text-center py-4">
          No cert-manager installation detected
        </p>
      </div>
    )
  }

  if (isLoading && issuers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse grid grid-cols-2 @md:grid-cols-4 gap-1.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-2 rounded-lg bg-secondary/30 h-16" />
          ))}
        </div>
        <div className="animate-pulse space-y-1.5">
          <div className="h-4 w-16 bg-secondary/30 rounded" />
          <div className="h-12 bg-secondary/30 rounded" />
          <div className="h-12 bg-secondary/30 rounded" />
        </div>
      </div>
    )
  }

  const topIssuers = [...issuers]
    .sort((a, b) => b.certificateCount - a.certificateCount)
    .slice(0, 3)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className="text-xs text-muted-foreground">
          {status.recentRenewals} renewals/24h
        </span>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-1.5 text-center text-xs">
        <div className="p-2 rounded-lg bg-green-500/10">
          <p className="text-lg font-bold text-green-400">{status.validCertificates}</p>
          <p className="text-muted-foreground">Valid</p>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10">
          <p className="text-lg font-bold text-yellow-400">{status.expiringSoon}</p>
          <p className="text-muted-foreground">Expiring</p>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10">
          <p className="text-lg font-bold text-red-400">{status.expired}</p>
          <p className="text-muted-foreground">Expired</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-lg font-bold text-foreground">{status.totalCertificates}</p>
          <p className="text-muted-foreground">{t('common.total')}</p>
        </div>
      </div>

      {(status.pending > 0 || status.failed > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {status.pending > 0 && (
            <StatusBadge color="blue" rounded="full">
              {status.pending} pending
            </StatusBadge>
          )}
          {status.failed > 0 && (
            <StatusBadge color="red" rounded="full">
              {status.failed} failed
            </StatusBadge>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Issuers ({issuers.length})
        </p>
        {topIssuers.length > 0 ? (
          topIssuers.map((issuer) => (
            <div key={issuer.id} className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2">
                <Shield className={`w-3 h-3 ${
                  issuer.status === 'ready' ? 'text-green-400' :
                  issuer.status === 'not-ready' ? 'text-red-400' :
                  'text-muted-foreground'
                }`} />
                <span className="text-xs text-foreground truncate max-w-[120px]">{issuer.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-muted-foreground">{issuer.kind}</span>
                <span className="text-xs font-medium text-foreground">{issuer.certificateCount}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No issuers found
          </p>
        )}
      </div>
    </div>
  )
}
