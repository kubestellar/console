export interface ConsoleEvidenceEntry {
  type: string
  text: string
  location?: string
}

export interface NetworkEvidenceEntry {
  url: string
  method: string
  status?: number
  failureText?: string
}

export interface RateLimitEvidenceEntry extends NetworkEvidenceEntry {
  retryAfter?: string
}

export interface BoundingBoxEvidence {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface LiveUiFailureEvidence {
  forbiddenMatches?: Array<{ label: string; text: string }>
  warningBadges?: Array<{ text: string; count: number }>
  textCollisions?: Array<{ first: string; second: string; ratio: number }>
  unexpectedNetworkResponses?: string[]
  unexpectedRequestFailures?: string[]
  recoveredAuthBoundaryResponses?: string[]
  networkClassifications?: Array<{ classification: string; method?: string; status?: number; url: string }>
  dashboardMismatches?: Array<{ field: string; expected: number | string; actual: number | string | null; actualValues?: Array<number | null>; route: string; reason?: string }>
  routeFailures?: Array<{ route: string; reason: string; expected?: string; actual?: string | null }>
  apiUiMismatches?: Array<{ route: string; field: string; expected: number | string; actual: number | string | null; actualValues?: Array<number | null>; apiStatus?: number | null; reason?: string }>
  interactiveFailures?: Array<{ control: string; reason: string; route: string }>
  fixtureMismatches?: Array<{ resource: string; expected: string; actual?: string | null; route?: string }>
  browserMatrixFailures?: Array<{
    classification: string
    browser?: string
    route?: string
    control?: string
    reason: string
    screenshotPath?: string
  }>
}

export interface VisualLoginEvidence {
  testTitle: string
  invariantIds: string[]
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'
  url: string
  viewport: { width: number; height: number } | null
  browserProject: string
  appMode: string
  timestamp: string
  screenshotPath?: string
  console: {
    errors: ConsoleEvidenceEntry[]
    warnings: ConsoleEvidenceEntry[]
    pageErrors: string[]
  }
  network: {
    failed: NetworkEvidenceEntry[]
    errorResponses: NetworkEvidenceEntry[]
    requestCountsByEndpoint?: Record<string, number>
    rateLimitEvents?: RateLimitEvidenceEntry[]
  }
  domSnippet?: string
  ariaSnapshot?: string
  boundingBoxes?: BoundingBoxEvidence[]
  liveUiFailures?: LiveUiFailureEvidence
}

export interface EvidenceCollectors {
  consoleErrors: ConsoleEvidenceEntry[]
  consoleWarnings: ConsoleEvidenceEntry[]
  pageErrors: string[]
  failedRequests: NetworkEvidenceEntry[]
  errorResponses: NetworkEvidenceEntry[]
  requestCountsByEndpoint: Record<string, number>
  rateLimitEvents: RateLimitEvidenceEntry[]
  liveUiFailures?: LiveUiFailureEvidence
}
