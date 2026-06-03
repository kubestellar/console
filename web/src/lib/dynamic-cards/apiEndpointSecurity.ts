const DYNAMIC_CARD_API_PREFIX = '/api/'
const DYNAMIC_CARD_ALLOWED_HTTP_PROTOCOL = 'http:'
const DYNAMIC_CARD_ALLOWED_HTTPS_PROTOCOL = 'https:'
const IPV4_SEGMENT_COUNT = 4
const IPV4_MIN_SEGMENT_VALUE = 0
const IPV4_MAX_SEGMENT_VALUE = 255
const IPV4_LOOPBACK_PREFIX = 127
const IPV4_PRIVATE_CLASS_A_PREFIX = 10
const IPV4_PRIVATE_CLASS_B_PREFIX = 172
const IPV4_PRIVATE_CLASS_B_SECOND_OCTET_MIN = 16
const IPV4_PRIVATE_CLASS_B_SECOND_OCTET_MAX = 31
const IPV4_PRIVATE_CLASS_C_PREFIX = 192
const IPV4_PRIVATE_CLASS_C_SECOND_OCTET = 168
const IPV4_LINK_LOCAL_PREFIX = 169
const IPV4_LINK_LOCAL_SECOND_OCTET = 254
const IPV4_CGNAT_PREFIX = 100
const IPV4_CGNAT_SECOND_OCTET_MIN = 64
const IPV4_CGNAT_SECOND_OCTET_MAX = 127
const IPV4_ZERO_PREFIX = 0
const IPV6_LOOPBACK = '::1'
const IPV6_UNIQUE_LOCAL_PREFIX = 'fc'
const IPV6_UNIQUE_LOCAL_ALT_PREFIX = 'fd'
const IPV6_LINK_LOCAL_PREFIX = 'fe80'

export const DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR = 'dynamicCard.unsafeEndpoint'
export const DYNAMIC_CARD_INVALID_ENDPOINT_ERROR = 'dynamicCard.invalidEndpoint'
export const DYNAMIC_CARD_EMBEDDED_CREDENTIALS_ERROR = 'dynamicCard.embeddedCredentialsEndpoint'
export const DYNAMIC_CARD_PRIVATE_IP_ERROR = 'dynamicCard.privateIpEndpoint'

interface DynamicCardApiRequest {
  requestUrl: string
  headers: Record<string, string>
  credentials: RequestCredentials
}

function isIPv4Hostname(hostname: string): boolean {
  const segments = hostname.split('.')
  if (segments.length !== IPV4_SEGMENT_COUNT) return false

  return segments.every((segment) => {
    if (!/^\d+$/.test(segment)) return false
    const value = Number(segment)
    return Number.isInteger(value) && value >= IPV4_MIN_SEGMENT_VALUE && value <= IPV4_MAX_SEGMENT_VALUE
  })
}

function isBlockedIPv4Hostname(hostname: string): boolean {
  if (!isIPv4Hostname(hostname)) return false

  const [first, second] = hostname.split('.').map(Number)

  if (first === IPV4_ZERO_PREFIX) return true
  if (first === IPV4_LOOPBACK_PREFIX) return true
  if (first === IPV4_PRIVATE_CLASS_A_PREFIX) return true
  if (first === IPV4_LINK_LOCAL_PREFIX && second === IPV4_LINK_LOCAL_SECOND_OCTET) return true
  if (first === IPV4_PRIVATE_CLASS_B_PREFIX && second >= IPV4_PRIVATE_CLASS_B_SECOND_OCTET_MIN && second <= IPV4_PRIVATE_CLASS_B_SECOND_OCTET_MAX) return true
  if (first === IPV4_PRIVATE_CLASS_C_PREFIX && second === IPV4_PRIVATE_CLASS_C_SECOND_OCTET) return true
  if (first === IPV4_CGNAT_PREFIX && second >= IPV4_CGNAT_SECOND_OCTET_MIN && second <= IPV4_CGNAT_SECOND_OCTET_MAX) return true

  return false
}

function isBlockedIPv6Hostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!normalizedHostname.includes(':')) return false

  return normalizedHostname === IPV6_LOOPBACK ||
    normalizedHostname.startsWith(IPV6_UNIQUE_LOCAL_PREFIX) ||
    normalizedHostname.startsWith(IPV6_UNIQUE_LOCAL_ALT_PREFIX) ||
    normalizedHostname.startsWith(IPV6_LINK_LOCAL_PREFIX)
}

function isBlockedIPAddress(hostname: string): boolean {
  return isBlockedIPv4Hostname(hostname) || isBlockedIPv6Hostname(hostname)
}

function getCurrentOrigin(currentOrigin?: string): string {
  if (currentOrigin) return currentOrigin
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function buildDynamicCardApiRequest(
  apiEndpoint: string,
  sessionToken: string | null,
  currentOrigin?: string,
): DynamicCardApiRequest {
  const trimmedEndpoint = apiEndpoint.trim()
  if (!trimmedEndpoint) {
    throw new Error(DYNAMIC_CARD_INVALID_ENDPOINT_ERROR)
  }

  if (trimmedEndpoint.startsWith('/')) {
    if (!trimmedEndpoint.startsWith(DYNAMIC_CARD_API_PREFIX)) {
      throw new Error(DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR)
    }

    return {
      requestUrl: trimmedEndpoint,
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      credentials: 'omit',
    }
  }

  let parsedEndpoint: URL
  try {
    parsedEndpoint = new URL(trimmedEndpoint)
  } catch {
    throw new Error(DYNAMIC_CARD_INVALID_ENDPOINT_ERROR)
  }

  if (parsedEndpoint.protocol !== DYNAMIC_CARD_ALLOWED_HTTP_PROTOCOL && parsedEndpoint.protocol !== DYNAMIC_CARD_ALLOWED_HTTPS_PROTOCOL) {
    throw new Error(DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR)
  }

  if (parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error(DYNAMIC_CARD_EMBEDDED_CREDENTIALS_ERROR)
  }

  if (isBlockedIPAddress(parsedEndpoint.hostname)) {
    throw new Error(DYNAMIC_CARD_PRIVATE_IP_ERROR)
  }

  if (parsedEndpoint.origin !== getCurrentOrigin(currentOrigin) || !parsedEndpoint.pathname.startsWith(DYNAMIC_CARD_API_PREFIX)) {
    throw new Error(DYNAMIC_CARD_UNSAFE_ENDPOINT_ERROR)
  }

  return {
    requestUrl: `${parsedEndpoint.pathname}${parsedEndpoint.search}${parsedEndpoint.hash}`,
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    credentials: 'omit',
  }
}
