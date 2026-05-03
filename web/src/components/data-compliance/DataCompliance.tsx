import { AlertTriangle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDataCompliance } from '../../hooks/useDataCompliance'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { RotatingTip } from '../ui/RotatingTip'

const DATA_COMPLIANCE_CARDS_KEY = 'data-compliance-dashboard-cards'

// Default cards for Data Compliance dashboard
const DEFAULT_DATA_COMPLIANCE_CARDS = [
  { type: 'vault_secrets', title: 'HashiCorp Vault', position: { w: 4, h: 3 } },
  { type: 'external_secrets', title: 'External Secrets', position: { w: 4, h: 3 } },
  { type: 'cert_manager', title: 'Cert-Manager', position: { w: 4, h: 3 } },
  { type: 'namespace_rbac', title: 'Access Controls', position: { w: 6, h: 4 } },
]

export function DataCompliance() {
  const { isLoading: clustersLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  useGlobalFilters() // Keep hook for potential future use
  const { posture, scores, isLoading: complianceLoading, isDemoData, isRefreshing: complianceRefreshing, failedClusters } = useDataCompliance()

  const isLoading = clustersLoading || complianceLoading
  const isRefreshing = dataRefreshing || complianceRefreshing

  // Stats value getter — derives values from real cluster data
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    const demo = isDemoData
    switch (blockId) {
      // Encryption
      case 'encryption_score':
        return { value: `${scores.encryptionScore}%`, sublabel: 'encryption coverage', isClickable: false, isDemo: demo }
      case 'encrypted_secrets':
        return { value: posture.totalSecrets - posture.opaqueSecrets, sublabel: 'typed secrets', isClickable: false, isDemo: demo }
      case 'unencrypted_secrets':
        return { value: posture.opaqueSecrets, sublabel: 'opaque secrets', isClickable: false, isDemo: demo }

      // Cluster coverage
      case 'regions_compliant':
        return { value: `${posture.reachableClusters}/${posture.totalClusters}`, sublabel: 'clusters reachable', isClickable: false, isDemo: demo }

      // Access control
      case 'rbac_policies':
        return { value: posture.rbacPolicies, sublabel: 'RBAC policies', isClickable: false, isDemo: demo }
      case 'excessive_permissions':
        return { value: posture.clusterAdminBindings, sublabel: 'cluster-admin bindings', isClickable: false, isDemo: demo }

      // Certificates
      case 'pii_detected':
        return { value: posture.totalCertificates, sublabel: 'certificates', isClickable: false, isDemo: demo }
      case 'pii_protected':
        return { value: posture.validCertificates, sublabel: 'valid certs', isClickable: false, isDemo: demo }

      // Audit / namespaces
      case 'audit_enabled':
        return { value: posture.totalNamespaces, sublabel: 'namespaces', isClickable: false, isDemo: demo }
      case 'retention_days':
        return { value: posture.roleBindings, sublabel: 'role bindings', isClickable: false, isDemo: demo }

      // Framework scores (derived from real data)
      case 'gdpr_score':
        return { value: `${scores.overallScore}%`, sublabel: 'overall', isClickable: false, isDemo: demo }
      case 'hipaa_score':
        return { value: `${scores.rbacScore}%`, sublabel: 'RBAC', isClickable: false, isDemo: demo }
      case 'pci_score':
        return { value: `${scores.encryptionScore}%`, sublabel: 'secrets', isClickable: false, isDemo: demo }
      case 'soc2_score':
        return { value: `${scores.certScore}%`, sublabel: 'certificates', isClickable: false, isDemo: demo }

      default:
        return { value: '-' }
    }
  }

  const getStatValue = getDashboardStatValue

  return (
    <DashboardPage
      title="Data Compliance"
      subtitle="GDPR, HIPAA, PCI-DSS, and SOC 2 data protection compliance"
      icon="Database"
      rightExtra={<RotatingTip page="data-compliance" />}
      storageKey={DATA_COMPLIANCE_CARDS_KEY}
      defaultCards={DEFAULT_DATA_COMPLIANCE_CARDS}
      statsType="data-compliance"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={true}
      isDemoData={isDemoData}
      emptyState={{
        title: 'Data Compliance Dashboard',
        description: 'Add cards to monitor data encryption, access controls, and compliance frameworks.' }}
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
      {/* Partial cluster failure warning */}
      {failedClusters.length > 0 && !error && (
        <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <div className="font-medium">
              Data from {failedClusters.length}/{posture.totalClusters} clusters unavailable
            </div>
            <div className="text-sm text-muted-foreground">
              Unreachable: {(failedClusters || []).join(', ')}
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
