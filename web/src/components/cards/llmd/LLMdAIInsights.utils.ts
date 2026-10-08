import type { AIInsight } from '../../../lib/llmd/mockData'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'

/** Loose translation function type for helper functions that use dynamic keys */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string

/**
 * Generate real insights based on the selected stack's state
 */
export function generateStackInsights(stack: LLMdStack, t?: TranslateFn): AIInsight[] {
  const insights: AIInsight[] = []
  const now = new Date()

  // Check stack health status
  if (stack.status === 'degraded') {
    insights.push({
      id: 'stack-degraded',
      type: 'anomaly',
      severity: 'warning',
      title: t ? t('llmdAIInsights.stackHealthDegraded') : 'Stack Health Degraded',
      description: t ? t('llmdAIInsights.stackDegraded', { name: stack.name }) : `The ${stack.name} stack is in a degraded state. Some components may not be functioning optimally.`,
      recommendation: t ? t('llmdAIInsights.stackDegradedRec') : 'Check pod status and logs for failing components. Look for resource constraints or configuration issues.',
      metrics: {
        'Total Replicas': stack.totalReplicas,
        'Ready': stack.readyReplicas,
        'Status': stack.status },
      timestamp: now })
  } else if (stack.status === 'unhealthy') {
    insights.push({
      id: 'stack-unhealthy',
      type: 'anomaly',
      severity: 'critical',
      title: t ? t('llmdAIInsights.stackUnhealthy') : 'Stack Unhealthy',
      description: t ? t('llmdAIInsights.stackUnhealthyDesc', { name: stack.name }) : `The ${stack.name} stack is unhealthy. Critical components are not running.`,
      recommendation: t ? t('llmdAIInsights.stackUnhealthyRec') : 'Immediate investigation required. Check pod events, resource quotas, and node availability.',
      metrics: {
        'Total Replicas': stack.totalReplicas,
        'Ready': stack.readyReplicas,
        'Status': stack.status },
      timestamp: now })
  }

  // Check for missing gateway
  if (!stack.components.gateway) {
    insights.push({
      id: 'missing-gateway',
      type: 'capacity',
      severity: 'warning',
      title: t ? t('llmdAIInsights.noGatewayConfigured') : 'No Gateway Configured',
      description: t ? t('llmdAIInsights.noGatewayDesc') : 'This stack has no gateway component. External traffic routing may not be properly configured.',
      recommendation: t ? t('llmdAIInsights.noGatewayRec') : 'Deploy an Istio Gateway or Envoy ingress to handle external inference requests.',
      timestamp: now })
  }

  // Check for no autoscaler
  if (!stack.autoscaler) {
    insights.push({
      id: 'no-autoscaler',
      type: 'optimization',
      severity: 'info',
      title: t ? t('llmdAIInsights.manualScaling') : 'Manual Scaling Configured',
      description: t ? t('llmdAIInsights.manualScalingDesc') : 'This stack does not have an autoscaler. Replicas must be scaled manually.',
      recommendation: t ? t('llmdAIInsights.manualScalingRec') : 'Consider enabling Variant Autoscaling (WVA) or HPA for automatic scaling based on load.',
      metrics: {
        'Current Replicas': stack.totalReplicas,
        'Autoscaler': 'None' },
      timestamp: now })
  } else {
    // Check autoscaler headroom
    const currentReplicas = stack.autoscaler.currentReplicas ?? 0
    const maxReplicas = stack.autoscaler.maxReplicas ?? 0
    if (maxReplicas > 0) {
      const headroomPercent = ((maxReplicas - currentReplicas) / maxReplicas) * 100
      if (headroomPercent < 20) {
        insights.push({
          id: 'low-autoscaler-headroom',
          type: 'capacity',
          severity: 'warning',
          title: t ? t('llmdAIInsights.limitedHeadroom') : 'Limited Scaling Headroom',
          description: t ? t('llmdAIInsights.limitedHeadroomDesc', { current: currentReplicas, max: maxReplicas }) : `Autoscaler is at ${currentReplicas}/${maxReplicas} replicas. Limited capacity for traffic spikes.`,
          recommendation: t ? t('llmdAIInsights.limitedHeadroomRec') : 'Consider increasing maxReplicas to allow for traffic bursts, or optimize resource usage.',
          metrics: {
            'Current': currentReplicas,
            'Max': maxReplicas,
            'Headroom': `${headroomPercent.toFixed(0)}%` },
          timestamp: now })
      }
    }
  }

  // Check replica readiness
  if (stack.totalReplicas > 0 && stack.readyReplicas < stack.totalReplicas) {
    const readyPercent = (stack.readyReplicas / stack.totalReplicas) * 100
    insights.push({
      id: 'replica-not-ready',
      type: 'anomaly',
      severity: readyPercent < 50 ? 'critical' : 'warning',
      title: 'Replicas Not Ready',
      description: `Only ${stack.readyReplicas} of ${stack.totalReplicas} replicas are ready (${readyPercent.toFixed(0)}%).`,
      recommendation: 'Check pod status for pending or failing replicas. Look for resource constraints or image pull issues.',
      metrics: {
        'Ready': stack.readyReplicas,
        'Total': stack.totalReplicas,
        'Health': `${readyPercent.toFixed(0)}%` },
      timestamp: now })
  }

  // P/D disaggregation insights
  if (stack.hasDisaggregation) {
    const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
    const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)

    if (prefillCount > 0 && decodeCount > 0) {
      const ratio = prefillCount / decodeCount

      if (ratio > 3) {
        insights.push({
          id: 'pd-ratio-high',
          type: 'optimization',
          severity: 'info',
          title: 'High Prefill/Decode Ratio',
          description: `Prefill to decode ratio is ${ratio.toFixed(1)}:1. This may indicate decode bottleneck potential.`,
          recommendation: 'Consider adding more decode replicas if you observe high TPOT latency.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1` },
          timestamp: now })
      } else if (ratio < 0.5) {
        insights.push({
          id: 'pd-ratio-low',
          type: 'optimization',
          severity: 'info',
          title: 'Low Prefill/Decode Ratio',
          description: `Prefill to decode ratio is ${ratio.toFixed(1)}:1. Prefill phase may be a bottleneck.`,
          recommendation: 'Consider adding more prefill replicas if you observe high TTFT latency.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1` },
          timestamp: now })
      } else {
        insights.push({
          id: 'pd-balanced',
          type: 'performance',
          severity: 'info',
          title: 'Balanced P/D Configuration',
          description: `Disaggregated serving with balanced ${ratio.toFixed(1)}:1 prefill-to-decode ratio.`,
          recommendation: 'Configuration looks optimal. Monitor TTFT and TPOT metrics for fine-tuning.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1` },
          timestamp: now })
      }
    }
  } else if (stack.components.both.length > 0) {
    // Unified serving - suggest disaggregation
    const totalReplicas = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)
    if (totalReplicas >= 4) {
      insights.push({
        id: 'suggest-disaggregation',
        type: 'performance',
        severity: 'info',
        title: 'Disaggregation Opportunity',
        description: `Running ${totalReplicas} unified replicas. Prefill/Decode disaggregation could improve TTFT by 30-50%.`,
        recommendation: 'Consider enabling P/D disaggregation for large deployments to reduce time-to-first-token.',
        metrics: {
          'Current Mode': 'Unified',
          'Replicas': totalReplicas,
          'Potential TTFT': '-40%' },
        timestamp: now })
    }
  }

  // If stack looks healthy with no issues, add a positive insight
  if (insights.length === 0 && stack.status === 'healthy') {
    insights.push({
      id: 'stack-healthy',
      type: 'performance',
      severity: 'info',
      title: 'Stack Operating Normally',
      description: `The ${stack.name} stack is healthy with all ${stack.readyReplicas} replicas ready.`,
      recommendation: 'Continue monitoring. Consider setting up alerts for latency thresholds.',
      metrics: {
        'Status': 'Healthy',
        'Replicas': `${stack.readyReplicas}/${stack.totalReplicas}`,
        'Model': stack.model || 'N/A' },
      timestamp: now })
  }

  return insights
}

/**
 * Build a contextual chat reply for the AI Insights chat box based on the
 * selected stack (live mode) or canned keyword responses (demo mode).
 */
export function buildChatResponse(
  userMessage: string,
  stack: LLMdStack | null | undefined,
  shouldUseDemoData: boolean,
): string {
  let response: string
  const messageLower = userMessage.toLowerCase()

  if (shouldUseDemoData) {
    // Demo mode responses
    const responses: Record<string, string> = {
      'scale': 'Based on current load patterns, I recommend scaling up to 4 prefill replicas during peak hours (10am-2pm) and scaling down to 2 during off-peak.',
      'cache': 'KV cache utilization is averaging 72% with occasional spikes to 87%. Consider enabling prefix caching for repeated prompt patterns.',
      'performance': 'Current TTFT is 420ms. To optimize, consider enabling disaggregated serving - this could reduce TTFT to ~280ms.',
      'default': 'I can help analyze your LLM-d stack. Try asking about scaling recommendations, cache optimization, or performance tuning.' }
    const keyword = Object.keys(responses).find(k => messageLower.includes(k)) || 'default'
    response = responses[keyword]
  } else if (stack) {
    // Live mode responses based on actual stack
    if (messageLower.includes('scale') || messageLower.includes('replica')) {
      if (stack.autoscaler) {
        const curReplicas = stack.autoscaler.currentReplicas ?? 0
        const maxReplicas = stack.autoscaler.maxReplicas ?? 0
        response = `Your stack "${stack.name}" is using ${stack.autoscaler.type} autoscaling with ${curReplicas}/${maxReplicas} replicas. ${maxReplicas > 0 && curReplicas >= maxReplicas * 0.8 ? 'Consider increasing maxReplicas for more headroom.' : 'Current scaling configuration looks healthy.'}`
      } else {
        response = `Stack "${stack.name}" has ${stack.totalReplicas} manual replicas. Consider enabling Variant Autoscaling (WVA) for automatic scaling based on queue depth and KV cache pressure.`
      }
    } else if (messageLower.includes('disaggregat') || messageLower.includes('prefill') || messageLower.includes('decode')) {
      if (stack.hasDisaggregation) {
        const pCount = stack.components.prefill.reduce((s, c) => s + c.replicas, 0)
        const dCount = stack.components.decode.reduce((s, c) => s + c.replicas, 0)
        response = `Stack "${stack.name}" uses P/D disaggregation with ${pCount} prefill and ${dCount} decode replicas. This optimizes TTFT by separating compute-intensive prefill from memory-bound decode.`
      } else {
        response = `Stack "${stack.name}" uses unified serving (${stack.totalReplicas} replicas). Disaggregation could reduce TTFT by 30-50% for large models by separating prefill and decode phases.`
      }
    } else if (messageLower.includes('health') || messageLower.includes('status')) {
      response = `Stack "${stack.name}" is ${stack.status}. ${stack.readyReplicas}/${stack.totalReplicas} replicas ready. Model: ${stack.model || 'Unknown'}. ${stack.status !== 'healthy' ? 'Check pod logs for issues.' : 'All systems operational.'}`
    } else {
      response = `I can help with your "${stack.name}" stack (${stack.model || 'model'}). Ask about scaling, disaggregation, health status, or optimization opportunities.`
    }
  } else {
    response = 'No stack selected. Select a stack from the stack selector to get contextual insights.'
  }

  return response
}
