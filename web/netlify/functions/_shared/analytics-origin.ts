import { isAllowedOrigin } from "./cors"

interface AnalyticsRequestValidationOptions {
  requireOrigin: boolean
}

function normalizeOriginHeader(header: string | null): string | null {
  if (!header) {
    return null
  }

  try {
    return new URL(header).origin
  } catch {
    return null
  }
}

export function isAllowedAnalyticsProxyRequest(
  request: Request,
  options: AnalyticsRequestValidationOptions,
): boolean {
  const origin = normalizeOriginHeader(request.headers.get("origin"))
  const referer = normalizeOriginHeader(request.headers.get("referer"))

  if (origin && !isAllowedOrigin(origin)) {
    return false
  }

  if (referer && !isAllowedOrigin(referer)) {
    return false
  }

  if (origin && referer) {
    return origin === referer
  }

  if (options.requireOrigin) {
    return origin !== null
  }

  return origin !== null || referer !== null
}
