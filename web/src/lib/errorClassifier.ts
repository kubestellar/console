/**
 * Error classifier utility for detecting cluster connectivity issues
 * and providing actionable suggestions to users.
 */

export type ClusterErrorType = 'timeout' | 'auth' | 'network' | 'certificate' | 'unknown'

export interface ClassifiedError {
  type: ClusterErrorType
  message: string
  suggestion: string
  icon: 'WifiOff' | 'Lock' | 'XCircle' | 'ShieldAlert' | 'AlertCircle'
}

// Error patterns for classification
const ERROR_PATTERNS: Array<{
  type: ClusterErrorType
  patterns: RegExp[]
  suggestion: string
  icon: ClassifiedError['icon']
}> = [
  {
    type: 'timeout',
    patterns: [
      /timeout/i,
      /deadline exceeded/i,
      /context deadline/i,
      /timed out/i,
      /i\/o timeout/i,
      /connection timed out/i,
    ],
    suggestion: 'Check VPN connection or network connectivity',
    icon: 'WifiOff',
  },
  {
    type: 'auth',
    patterns: [
      /401/,
      /403/,
      /unauthorized/i,
      /forbidden/i,
      /authentication required/i,
      /invalid token/i,
      /token expired/i,
      /access denied/i,
      /not authorized/i,
    ],
    suggestion: 'Re-authenticate with the cluster',
    icon: 'Lock',
  },
  {
    type: 'network',
    patterns: [
      /connection refused/i,
      /no route to host/i,
      /network unreachable/i,
      /host unreachable/i,
      /dial tcp/i,
      /no such host/i,
      /dns/i,
      /lookup.*failed/i,
      /could not resolve/i,
    ],
    suggestion: 'Check network connectivity and firewall settings',
    icon: 'XCircle',
  },
  {
    type: 'certificate',
    patterns: [
      /x509/i,
      /tls/i,
      /certificate/i,
      /cert/i,
      /ssl/i,
      /verify.*failed/i,
      /invalid.*chain/i,
    ],
    suggestion: 'Check certificate validity or trust settings',
    icon: 'ShieldAlert',
  },
]

/**
 * Classify an error message and return actionable information
 */
export function classifyError(errorMessage: string): ClassifiedError {
  if (!errorMessage) {
    return {
      type: 'unknown',
      message: 'Unknown error',
      suggestion: 'Check cluster connectivity and configuration',
      icon: 'AlertCircle',
    }
  }

  for (const { type, patterns, suggestion, icon } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return {
          type,
          message: truncateMessage(errorMessage),
          suggestion,
          icon,
        }
      }
    }
  }

  return {
    type: 'unknown',
    message: truncateMessage(errorMessage),
    suggestion: 'Check cluster connectivity and configuration',
    icon: 'AlertCircle',
  }
}

/**
 * Extract error type from a string (used when backend provides errorType field)
 */
export function getErrorTypeFromString(errorType: string | undefined): ClusterErrorType {
  if (!errorType) return 'unknown'
  const normalized = errorType.toLowerCase()
  if (['timeout', 'auth', 'network', 'certificate'].includes(normalized)) {
    return normalized as ClusterErrorType
  }
  return 'unknown'
}

/**
 * Get icon name for an error type
 */
export function getIconForErrorType(type: ClusterErrorType): ClassifiedError['icon'] {
  const iconMap: Record<ClusterErrorType, ClassifiedError['icon']> = {
    timeout: 'WifiOff',
    auth: 'Lock',
    network: 'XCircle',
    certificate: 'ShieldAlert',
    unknown: 'AlertCircle',
  }
  return iconMap[type]
}

/**
 * Get suggestion for an error type
 */
export function getSuggestionForErrorType(type: ClusterErrorType): string {
  const suggestionMap: Record<ClusterErrorType, string> = {
    timeout: 'Check VPN connection or network connectivity',
    auth: 'Re-authenticate with the cluster',
    network: 'Check network connectivity and firewall settings',
    certificate: 'Check certificate validity or trust settings',
    unknown: 'Check cluster connectivity and configuration',
  }
  return suggestionMap[type]
}

/**
 * Truncate long error messages for display
 */
function truncateMessage(message: string, maxLength = 100): string {
  if (message.length <= maxLength) return message
  return message.slice(0, maxLength - 3) + '...'
}

/**
 * Format a duration for "last seen" display
 */
export function formatLastSeen(timestamp: string | Date | undefined): string {
  if (!timestamp) return 'never'

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  if (isNaN(date.getTime())) return 'never'

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 120) return '1m ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 7200) return '1h ago'
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 172800) return '1d ago'
  return `${Math.floor(seconds / 86400)}d ago`
}
