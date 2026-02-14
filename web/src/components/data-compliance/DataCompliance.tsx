import { useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { useTranslation } from 'react-i18next'

const DATA_COMPLIANCE_CARDS_KEY = 'data-compliance-dashboard-cards'

// Default cards for Data Compliance dashboard
const DEFAULT_DATA_COMPLIANCE_CARDS = [
  { type: 'vault_secrets', title: 'HashiCorp Vault', position: { w: 4, h: 3 } },
  { type: 'external_secrets', title: 'External Secrets', position: { w: 4, h: 3 } },
  { type: 'cert_manager', title: 'Cert-Manager', position: { w: 4, h: 3 } },
  { type: 'namespace_rbac', title: 'Access Controls', position: { w: 6, h: 4 } },
]

// Fixed demo data for data compliance posture
const DEMO_POSTURE = {
  // Encryption
  encryptedSecrets: 156,
  unencryptedSecrets: 8,
  encryptionScore: 94,
  // Data residency
  regionsCompliant: 4,
  regionsTotal: 5,
  // Access control
  rbacPolicies: 48,
  excessivePermissions: 6,
  // PII detection
  piiDetected: 12,
  piiProtected: 9,
  // Audit
  auditEnabled: 85,
  retentionDays: 90,
  // Framework scores
  gdprScore: 86,
  hipaaScore: 82,
  pciScore: 88,
  soc2Score: 84,
}

export function DataCompliance() {
  const { t: _t } = useTranslation()
  const { isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  useGlobalFilters() // Keep hook for potential future use
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Use fixed demo posture data
  const posture = DEMO_POSTURE

  // Stats value getter - returns fixed demo data with isDemo flag
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      // Encryption
      case 'encryption_score':
        return { value: `${posture.encryptionScore}%`, sublabel: 'encryption coverage', isClickable: false, isDemo: true }
      case 'encrypted_secrets':
        return { value: posture.encryptedSecrets, sublabel: 'encrypted secrets', isClickable: false, isDemo: true }
      case 'unencrypted_secrets':
        return { value: posture.unencryptedSecrets, sublabel: 'unencrypted', isClickable: false, isDemo: true }

      // Data residency
      case 'regions_compliant':
        return { value: `${posture.regionsCompliant}/${posture.regionsTotal}`, sublabel: 'regions compliant', isClickable: false, isDemo: true }

      // Access control
      case 'rbac_policies':
        return { value: posture.rbacPolicies, sublabel: 'RBAC policies', isClickable: false, isDemo: true }
      case 'excessive_permissions':
        return { value: posture.excessivePermissions, sublabel: 'excessive permissions', isClickable: false, isDemo: true }

      // PII
      case 'pii_detected':
        return { value: posture.piiDetected, sublabel: 'PII instances', isClickable: false, isDemo: true }
      case 'pii_protected':
        return { value: posture.piiProtected, sublabel: 'protected', isClickable: false, isDemo: true }

      // Audit
      case 'audit_enabled':
        return { value: `${posture.auditEnabled}%`, sublabel: 'audit enabled', isClickable: false, isDemo: true }
      case 'retention_days':
        return { value: posture.retentionDays, sublabel: 'day retention', isClickable: false, isDemo: true }

      // Framework scores
      case 'gdpr_score':
        return { value: `${posture.gdprScore}%`, sublabel: 'GDPR', isClickable: false, isDemo: true }
      case 'hipaa_score':
        return { value: `${posture.hipaaScore}%`, sublabel: 'HIPAA', isClickable: false, isDemo: true }
      case 'pci_score':
        return { value: `${posture.pciScore}%`, sublabel: 'PCI-DSS', isClickable: false, isDemo: true }
      case 'soc2_score':
        return { value: `${posture.soc2Score}%`, sublabel: 'SOC 2', isClickable: false, isDemo: true }

      default:
        return { value: '-' }
    }
  }, [posture])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Data Compliance"
      subtitle="GDPR, HIPAA, PCI-DSS, and SOC 2 data protection compliance"
      icon="Database"
      storageKey={DATA_COMPLIANCE_CARDS_KEY}
      defaultCards={DEFAULT_DATA_COMPLIANCE_CARDS}
      statsType="data-compliance"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={true}
      isDemoData={true}
      emptyState={{
        title: 'Data Compliance Dashboard',
        description: 'Add cards to monitor data encryption, access controls, and compliance frameworks.',
      }}
    >
      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <div className="font-medium">Failed to load cluster data</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
