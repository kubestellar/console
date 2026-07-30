import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useServiceDrillDown } from './useServiceDrillDown'
import {
  ServiceDrillDownHeader, ServiceTabBar, ServiceOverviewTab,
  ServiceEndpointsTab, ServiceOutputPane,
} from './ServiceDrillDown.parts'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

export default function ServiceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const serviceName = data.service as string
  const { drillToNamespace, drillToCluster, drillToPod } = useDrillDownActions()

  const {
    activeTab, setActiveTab,
    serviceType, clusterIP, externalIPs, ports, endpointCount, lbStatus,
    selector, labels, endpointAddresses,
    describeOutput, describeLoading, loadDescribe,
    yamlOutput, yamlLoading, loadYaml,
    copiedField, handleCopy,
    isLoading, health, lbStatusLabel, tabs,
  } = useServiceDrillDown(cluster, namespace, serviceName, data)

  return (
    <div className="space-y-4">
      <ServiceDrillDownHeader
        serviceName={serviceName}
        serviceType={serviceType}
        cluster={cluster}
        namespace={namespace}
        health={health}
        lbStatus={lbStatus}
        lbStatusLabel={lbStatusLabel}
        onDrillToNamespace={drillToNamespace}
        onDrillToCluster={drillToCluster}
      />

      <ServiceTabBar activeTab={activeTab} tabs={tabs} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <ServiceOverviewTab
            isLoading={isLoading}
            serviceType={serviceType}
            clusterIP={clusterIP}
            externalIPs={externalIPs}
            endpointCount={endpointCount}
            ports={ports}
            selector={selector}
            labels={labels}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        </div>
      )}

      {activeTab === 'endpoints' && (
        <div className="space-y-3">
          <ServiceEndpointsTab
            endpointAddresses={endpointAddresses}
            cluster={cluster}
            namespace={namespace}
            onDrillToPod={drillToPod}
          />
        </div>
      )}

      {activeTab === 'describe' && (
        <ServiceOutputPane
          output={describeOutput}
          loading={describeLoading}
          loadLabel={t('drilldown.service.loadDescribe')}
          loadingLabel={t('drilldown.service.runningDescribe')}
          copyField="describe"
          copiedField={copiedField}
          onLoad={loadDescribe}
          onCopy={handleCopy}
        />
      )}

      {activeTab === 'yaml' && (
        <ServiceOutputPane
          output={yamlOutput}
          loading={yamlLoading}
          loadLabel={t('drilldown.service.loadYaml')}
          loadingLabel={t('drilldown.service.loadingYaml')}
          copyField="yaml"
          copiedField={copiedField}
          onLoad={loadYaml}
          onCopy={handleCopy}
        />
      )}
    </div>
  )
}
