/**
 * Technical Acronym Component
 * 
 * Provides tooltips for technical abbreviations and Kubernetes terminology
 * using the existing PortalTooltip component.
 */
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Comprehensive mapping of technical abbreviations used in the console
export const TECHNICAL_ACRONYMS: Record<string, { full: string; desc: string }> = {
  // Compute Resources
  CPU: { 
    full: 'Central Processing Unit', 
    desc: 'The primary processor that executes instructions and manages workloads' 
  },
  GPU: { 
    full: 'Graphics Processing Unit', 
    desc: 'Hardware accelerator used for parallel processing, AI/ML workloads, and graphics' 
  },
  
  // Storage
  PVC: { 
    full: 'Persistent Volume Claim', 
    desc: 'Request for storage by a pod, bound to a Persistent Volume' 
  },
  PV: { 
    full: 'Persistent Volume', 
    desc: 'Cluster-level storage resource provisioned by an administrator or dynamically' 
  },
  
  // Security & Access Control
  RBAC: { 
    full: 'Role-Based Access Control', 
    desc: 'Authorization mechanism that regulates access to resources based on roles' 
  },
  CRD: { 
    full: 'Custom Resource Definition', 
    desc: 'Extension of Kubernetes API that defines custom resource types' 
  },
  
  // Kubernetes Resources
  ConfigMap: { 
    full: 'Configuration Map', 
    desc: 'Stores configuration data as key-value pairs for pods to consume' 
  },
  ConfigMaps: { 
    full: 'Configuration Maps', 
    desc: 'Store configuration data as key-value pairs for pods to consume' 
  },
  Secret: { 
    full: 'Kubernetes Secret', 
    desc: 'Stores sensitive data like passwords, tokens, or keys with encryption at rest' 
  },
  Secrets: { 
    full: 'Kubernetes Secrets', 
    desc: 'Store sensitive data like passwords, tokens, or keys with encryption at rest' 
  },
  
  // Pod Status & Errors
  OOMKilled: { 
    full: 'Out Of Memory Killed', 
    desc: 'Container was terminated because it exceeded its memory limit' 
  },
  CrashLoopBackOff: { 
    full: 'Crash Loop Back Off', 
    desc: 'Pod is repeatedly crashing and Kubernetes is backing off restart attempts' 
  },
  
  // Multi-Cluster Services
  MCS: { 
    full: 'Multi-Cluster Services', 
    desc: 'Kubernetes API for service discovery and connectivity across clusters' 
  },
  
  // Operators & Lifecycle
  OLM: { 
    full: 'Operator Lifecycle Manager', 
    desc: 'Manages installation, updates, and lifecycle of Kubernetes operators' 
  },
}

// Convenience component for displaying technical acronyms with tooltips
interface TechnicalAcronymProps {
  term: string
  className?: string
  children?: ReactNode
}

export function TechnicalAcronym({ term, className = '', children }: TechnicalAcronymProps) {
  const { t: _t } = useTranslation()
  const def = TECHNICAL_ACRONYMS[term]
  
  // If no definition exists, render without tooltip
  if (!def) {
    return <span className={className}>{children || term}</span>
  }

  return (
    <PortalTooltip
      className={className}
      content={
        <>
          <span className="font-semibold text-white">{def.full}</span>
          <br />
          <span className="text-slate-400">{def.desc}</span>
        </>
      }
    >
      {children || term}
    </PortalTooltip>
  )
}

// Status indicator tooltips
export const STATUS_TOOLTIPS: Record<string, string> = {
  healthy: 'All checks passing, resource is functioning normally',
  error: 'Critical failure detected, immediate attention required',
  warning: 'Non-critical issue detected, may require attention',
  critical: 'Severe error state, service may be unavailable',
  pending: 'Resource is being created or waiting for conditions to be met',
  loading: 'Status is being determined',
  unknown: 'Status cannot be determined',
  unreachable: 'Resource or cluster is not responding',
}

// Helper to wrap technical abbreviations in a string with tooltip components
export function wrapAbbreviations(text: string): ReactNode {
  // Order matters - longer terms first to avoid partial matches
  const abbreviations = [
    'ConfigMaps', 'ConfigMap', 'CrashLoopBackOff', 'OOMKilled',
    'RBAC', 'CRD', 'PVC', 'GPU', 'CPU', 'OLM', 'MCS', 'Secrets', 'Secret',
  ]
  const pattern = new RegExp(`\\b(${abbreviations.join('|')})\\b`, 'g')
  const parts: ReactNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    if (match.index !== undefined) {
      parts.push(
        <TechnicalAcronym key={`${match.index}-${match[0]}`} term={match[0]}>
          {match[0]}
        </TechnicalAcronym>
      )
      lastIndex = match.index + match[0].length
    }
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  return parts.length > 0 ? parts : text
}

export default TechnicalAcronym
