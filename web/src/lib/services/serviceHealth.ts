/**
 * Centralized service health derivation.
 *
 * Covers issues #6162-#6167: the Services dashboard needs one source of
 * truth for whether a service is healthy, orphaned (selector present but
 * no ready endpoints), still provisioning (LoadBalancer without ingress),
 * or in an unknown state. Every rendering surface (dashboard list, card
 * badges, drill-downs) must compute the badge from this module so the
 * behavior is consistent.
 */
import type { Service, ServicePortDetail } from '../../hooks/mcp/types'
import {
  LB_STATUS_PROVISIONING,
  PORT_NAME_SEPARATOR,
} from '../constants/network'

/** Derived health status for a service. Distinct from the k8s service
 * `type` (ClusterIP / LoadBalancer / …). */
export type ServiceHealthStatus =
  | 'healthy'        // has ready endpoints
  | 'orphaned'       // selector present but endpoints === 0 (covers #6164, #6165)
  | 'provisioning'   // LoadBalancer without an ingress address yet (#6153/#6167)
  | 'unknown'        // backend did not supply enough data to decide

/** Zero endpoints sentinel — extracted so the comparison is named and
 * not a bare `=== 0` magic number. */
const ZERO_ENDPOINTS = 0

/** `true` when the service has a non-empty selector. A service with no
 * selector cannot be classified as orphaned (it may be a headless /
 * manually-managed endpoints object). */
export function hasSelector(svc: Pick<Service, 'selector'>): boolean {
  return !!svc.selector && Object.keys(svc.selector).length > 0
}

/** Orphaned = selector matches no pods. Covers #6164 and #6165: a
 * ClusterIP service with zero ready endpoints cannot be reached. */
export function isOrphaned(
  svc: Pick<Service, 'endpoints' | 'selector' | 'lbStatus'>,
): boolean {
  // A LoadBalancer that is still provisioning is reported separately,
  // not as orphaned, even if its endpoints count is zero.
  if (svc.lbStatus === LB_STATUS_PROVISIONING) return false
  if (svc.endpoints === undefined) return false
  return svc.endpoints === ZERO_ENDPOINTS && hasSelector(svc)
}

// Note: a previous iteration exported `hasInvalidSelector` which flagged
// any non-ExternalName service with an empty selector as a configuration
// bug. Kubernetes legitimately allows selector-less Services backed by
// manually managed Endpoints/EndpointSlices (and headless services), so
// the heuristic produced false positives. The function had no production
// callers and was removed in PR #6181 follow-up — `deriveServiceHealth`
// already handles the "no selector + zero endpoints" case correctly by
// returning `unknown` rather than `orphaned`.

/** Derive the health status for a service. The order of the checks is
 * significant — provisioning wins over orphaned so a LoadBalancer that
 * has not yet received an ingress IP is not mis-reported as orphaned. */
export function deriveServiceHealth(
  svc: Pick<Service, 'endpoints' | 'selector' | 'lbStatus' | 'type'>,
): ServiceHealthStatus {
  if (svc.lbStatus === LB_STATUS_PROVISIONING) return 'provisioning'
  if (svc.endpoints === undefined) return 'unknown'
  if (isOrphaned(svc)) return 'orphaned'
  if (svc.endpoints > ZERO_ENDPOINTS) return 'healthy'
  // endpoints === 0 but no selector (headless / externally managed) —
  // we can't prove it's broken, so surface as unknown rather than
  // false-positive orphaned.
  return 'unknown'
}

/** Tailwind classes for the connectivity dot (#6167). Exported so every
 * renderer uses the same palette. */
export const SERVICE_HEALTH_DOT_CLASSES: Record<ServiceHealthStatus, string> = {
  healthy: 'bg-green-500',
  orphaned: 'bg-red-500',
  provisioning: 'bg-yellow-400 animate-pulse',
  unknown: 'bg-muted-foreground/40',
}

/** Human-readable label for the health status, used in tooltips and
 * badge aria labels. */
export const SERVICE_HEALTH_LABELS: Record<ServiceHealthStatus, string> = {
  healthy: 'Reachable',
  orphaned: 'Unreachable (no ready endpoints)',
  provisioning: 'Provisioning',
  unknown: 'Status unknown',
}

/** Format a single structured port for display, prefixing the port name
 * when one is set (#6163). */
export function formatServicePort(p: ServicePortDetail): string {
  const proto = p.protocol || 'TCP'
  const base =
    p.nodePort && p.nodePort !== 0
      ? `${p.port}:${p.nodePort}/${proto}`
      : `${p.port}/${proto}`
  return p.name ? `${p.name}${PORT_NAME_SEPARATOR}${base}` : base
}

/** Render a service's full port list. Prefers the structured
 * `portDetails` when supplied (newer backend), otherwise falls back to
 * the legacy flat `ports` array so this helper works with demo data
 * and older cached payloads. */
export function formatServicePorts(
  svc: Pick<Service, 'ports' | 'portDetails'>,
): string[] {
  if (svc.portDetails && svc.portDetails.length > 0) {
    return svc.portDetails.map(formatServicePort)
  }
  return svc.ports || []
}
