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

// Time boundary constants for relative time formatting (in seconds)
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3_600
const SECONDS_PER_DAY = 86_400
const TWO_MINUTES_IN_SECONDS = 120
const TWO_HOURS_IN_SECONDS = 7_200
const TWO_DAYS_IN_SECONDS = 172_800

/**
 * Format a duration for "last seen" display
 */
export function formatLastSeen(timestamp: string | Date | undefined): string {
  if (!timestamp) return 'never'

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  if (isNaN(date.getTime())) return 'never'

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < SECONDS_PER_MINUTE) return 'just now'
  if (seconds < TWO_MINUTES_IN_SECONDS) return '1m ago'
  if (seconds < SECONDS_PER_HOUR) return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ago`
  if (seconds < TWO_HOURS_IN_SECONDS) return '1h ago'
  if (seconds < SECONDS_PER_DAY) return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ago`
  if (seconds < TWO_DAYS_IN_SECONDS) return '1d ago'
  return `${Math.floor(seconds / SECONDS_PER_DAY)}d ago`
}
