/**
 * Events, Cost, CI/CD, AI/ML, and Miscellaneous Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { eventStreamConfig } from '../event-stream'
import { eventSummaryConfig } from '../event-summary'
import { eventsTimelineConfig } from '../events-timeline'
import { crossClusterEventCorrelationConfig } from '../cross-cluster-event-correlation'
import { restartCorrelationMatrixConfig } from '../restart-correlation-matrix'
import { cascadeImpactMapConfig } from '../cascade-impact-map'
import { configDriftHeatmapConfig } from '../config-drift-heatmap'
import { kubecostOverviewConfig } from '../kubecost-overview'
import { opencostOverviewConfig } from '../opencost-overview'
import { clusterCostsConfig } from '../cluster-costs'
import { githubActivityConfig } from '../github-activity'
import { githubCiMonitorConfig } from '../github-ci-monitor'
import { prowCiMonitorConfig } from '../prow-ci-monitor'
import { prowHistoryConfig } from '../prow-history'
import { prowJobsConfig } from '../prow-jobs'
import { prowStatusConfig } from '../prow-status'
import { nightlyE2eStatusConfig } from '../nightly-e2e-status'
import { llmInferenceConfig } from '../llm-inference'
import { llmModelsConfig } from '../llm-models'
import { llmdStackMonitorConfig } from '../llmd-stack-monitor'
import { mlJobsConfig } from '../ml-jobs'
import { mlNotebooksConfig } from '../ml-notebooks'
import { consoleAiHealthCheckConfig } from '../console-ai-health-check'
import { consoleAiIssuesConfig } from '../console-ai-issues'
import { consoleAiKubeconfigAuditConfig } from '../console-ai-kubeconfig-audit'
import { consoleAiOfflineDetectionConfig } from '../console-ai-offline-detection'
import { dynamicCardConfig } from '../dynamic-card'
import { iframeEmbedConfig } from '../iframe-embed'
import { kubectlConfig } from '../kubectl'
import { mobileBrowserConfig } from '../mobile-browser'
import { providerHealthConfig } from '../provider-health'
import { rssFeedConfig } from '../rss-feed'
import { stockMarketTickerConfig } from '../stock-market-ticker'
import { weatherConfig } from '../weather'
import { userManagementConfig } from '../user-management'
import { resourceMarshallConfig } from '../resource-marshall'

const miscCards = [
  { name: 'eventStream', config: eventStreamConfig },
  { name: 'eventSummary', config: eventSummaryConfig },
  { name: 'eventsTimeline', config: eventsTimelineConfig },
  { name: 'crossClusterEventCorrelation', config: crossClusterEventCorrelationConfig },
  { name: 'restartCorrelationMatrix', config: restartCorrelationMatrixConfig },
  { name: 'cascadeImpactMap', config: cascadeImpactMapConfig },
  { name: 'configDriftHeatmap', config: configDriftHeatmapConfig },
  { name: 'kubecostOverview', config: kubecostOverviewConfig },
  { name: 'opencostOverview', config: opencostOverviewConfig },
  { name: 'clusterCosts', config: clusterCostsConfig },
  { name: 'githubActivity', config: githubActivityConfig },
  { name: 'githubCiMonitor', config: githubCiMonitorConfig },
  { name: 'prowCiMonitor', config: prowCiMonitorConfig },
  { name: 'prowHistory', config: prowHistoryConfig },
  { name: 'prowJobs', config: prowJobsConfig },
  { name: 'prowStatus', config: prowStatusConfig },
  { name: 'nightlyE2eStatus', config: nightlyE2eStatusConfig },
  { name: 'llmInference', config: llmInferenceConfig },
  { name: 'llmModels', config: llmModelsConfig },
  { name: 'llmdStackMonitor', config: llmdStackMonitorConfig },
  { name: 'mlJobs', config: mlJobsConfig },
  { name: 'mlNotebooks', config: mlNotebooksConfig },
  { name: 'consoleAiHealthCheck', config: consoleAiHealthCheckConfig },
  { name: 'consoleAiIssues', config: consoleAiIssuesConfig },
  { name: 'consoleAiKubeconfigAudit', config: consoleAiKubeconfigAuditConfig },
  { name: 'consoleAiOfflineDetection', config: consoleAiOfflineDetectionConfig },
  { name: 'dynamicCard', config: dynamicCardConfig },
  { name: 'iframeEmbed', config: iframeEmbedConfig },
  { name: 'kubectl', config: kubectlConfig },
  { name: 'mobileBrowser', config: mobileBrowserConfig },
  { name: 'providerHealth', config: providerHealthConfig },
  { name: 'rssFeed', config: rssFeedConfig },
  { name: 'stockMarketTicker', config: stockMarketTickerConfig },
  { name: 'weather', config: weatherConfig },
  { name: 'userManagement', config: userManagementConfig },
  { name: 'resourceMarshall', config: resourceMarshallConfig },
]

describe('Events, cost, CI/CD, AI/ML, misc card configs', () => {
  it.each(miscCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
