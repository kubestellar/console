/**
 * Enterprise Compliance Card Components
 *
 * Lightweight summary cards for the Console Studio that link to full dashboards.
 * Each card fetches summary data and renders a compact view.
 *
 * Implementation lives in ./enterprise-compliance/, split by domain
 * (compliance, gov-security, secops, identity, supply-chain, risk) plus a
 * shared module for common plumbing. This file re-exports everything so
 * existing imports of './EnterpriseComplianceCards' keep working.
 */
export * from './enterprise-compliance'
