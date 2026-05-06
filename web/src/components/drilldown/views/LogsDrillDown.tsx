import { useState, useEffect, useRef, useMemo } from 'react'
import { Loader2, AlertCircle, Server, Layers, Box, RefreshCw, Filter } from 'lucide-react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

// Issue 9282: Logs drilldown controls (tail lines, Follow, Download, Refresh)
// were wired to UI but did nothing. Logs are a static mock until a real API
// lands (see original issue). This implementation makes the controls
// behave against the mock data so the UI is consistent with its labels.

/** Simulated refresh spinner duration (ms). Matches the prior visual delay. */
const REFRESH_SPINNER_MS = 500

/** How often the "follow" tailer appends a new heartbeat line (ms). */
const FOLLOW_TICK_MS = 1_000

/** Valid tail-line choices. Kept as a named constant rather than a magic array. */
const TAIL_LINE_OPTIONS = [50, 100, 500, 1000] as const

/** Default tail lines on mount. */
const DEFAULT_TAIL_LINES = 100

/** Log severity levels for filtering, inspired by CNCF Headlamp PR #5338 */
const LOG_LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const
type LogLevel = typeof LOG_LEVELS[number]

/** Default log level filter */
const DEFAULT_LOG_LEVEL: LogLevel = 'ALL'

/** Build the seed (static placeholder) log body. Extracted so Refresh can
 *  regenerate the timestamp and tail slicing can operate on an array. */
function buildSeedLogLines(pod: string, container: string | undefined, generatedAtISO: string): string[] {
  const base = new Date(generatedAtISO).getTime()
  const fmt = (offsetMs: number) => new Date(base + offsetMs).toISOString().replace('T', ' ').slice(0, 19)
  return [
    `# Fetching logs for pod: ${pod}`,
    `# Container: ${container || 'all'}`,
    `# Generated: ${generatedAtISO}`,
    `[${fmt(0)}] [INFO] Starting application...`,
    `[${fmt(1_000)}] [DEBUG] Initializing components...`,
    `[${fmt(2_000)}] [INFO] Server listening on port 8080`,
    `[${fmt(3_000)}] [INFO] Connected to database`,
    `[${fmt(4_000)}] [WARN] High memory usage detected`,
    `[${fmt(5_000)}] [INFO] Health check passed`,
    `[${fmt(6_000)}] [DEBUG] Processing request queue`,
    `[${fmt(7_000)}] [ERROR] Failed to connect to cache server`,
    `[${fmt(8_000)}] [WARN] Retrying cache connection...`,
    `[${fmt(9_000)}] [INFO] Cache connection restored`,
    `[${fmt(10_000)}] [INFO] Ready to accept connections`,
  ]
}

/** Extract log level from a log line */
function extractLogLevel(line: string): LogLevel | null {
  const match = line.match(/\[(DEBUG|INFO|WARN|ERROR)\]/)
  return match ? (match[1] as LogLevel) : null
}

/** Filter log lines by severity level */
function filterLogsByLevel(lines: string[], level: LogLevel): string[] {
  if (level === 'ALL') return lines
  
  // Define severity hierarchy
  const levelPriority: Record<LogLevel, number> = {
    ALL: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
  }
  
  const minPriority = levelPriority[level]
  
  return lines.filter(line => {
    const lineLevel = extractLogLevel(line)
    // Include header lines (without level) and lines matching/exceeding severity
    if (!lineLevel || line.startsWith('#')) return true
    return levelPriority[lineLevel] >= minPriority
  })
}

export function LogsDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const pod = data.pod as string
  const container = data.container as string | undefined
  const { drillToCluster, drillToNamespace, drillToPod } = useDrillDownActions()
  const clusterShort = cluster?.split('/').pop() || cluster
  const [tailLines, setTailLines] = useState<number>(DEFAULT_TAIL_LINES)
  const [logLevel, setLogLevel] = useState<LogLevel>(DEFAULT_LOG_LEVEL)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  // Refresh bumps the generatedAt timestamp which regenerates the seed lines
  // so the user sees that the fetch actually took effect.
  const [generatedAt, setGeneratedAt] = useState<string>(() => new Date().toISOString())
  // When follow is on we append heartbeat lines to a running buffer.
  const [followLines, setFollowLines] = useState<string[]>([])
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const followIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Regenerate the seed log block whenever the tail selector changes or the
  // user clicks Refresh. Memoized so tail slicing is cheap.
  const seedLines = useMemo(
    () => buildSeedLogLines(pod, container, generatedAt),
    [pod, container, generatedAt],
  )

  // Combined view = seed + follow heartbeats, filtered by level, sliced to the requested tail.
  const visibleLogLines = useMemo(() => {
    const all = [...seedLines, ...followLines]
    const filtered = filterLogsByLevel(all, logLevel)
    if (tailLines >= filtered.length) return filtered
    return filtered.slice(filtered.length - tailLines)
  }, [seedLines, followLines, tailLines, logLevel])

  const visibleLog = visibleLogLines.join('\n')

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) clearTimeout(refreshTimeoutRef.current)
      if (followIntervalRef.current !== null) clearInterval(followIntervalRef.current)
    }
  }, [])

  // Follow mode: append a synthetic heartbeat line every FOLLOW_TICK_MS and
  // auto-scroll to the bottom. Stops when follow is toggled off.
  useEffect(() => {
    if (!follow) {
      if (followIntervalRef.current !== null) {
        clearInterval(followIntervalRef.current)
        followIntervalRef.current = null
      }
      return
    }
    followIntervalRef.current = setInterval(() => {
      setFollowLines((prev) => {
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
        return [...prev, `[${ts}] (heartbeat)`]
      })
    }, FOLLOW_TICK_MS)
    return () => {
      if (followIntervalRef.current !== null) {
        clearInterval(followIntervalRef.current)
        followIntervalRef.current = null
      }
    }
  }, [follow])

  // Auto-scroll when follow is on and new lines arrive.
  useEffect(() => {
    if (!follow) return
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [follow, followLines])

  const handleRefresh = () => {
    setError(null)
    setIsLoading(true)
    if (refreshTimeoutRef.current !== null) clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => {
      // Bump the timestamp so seedLines regenerates with a new time,
      // giving visible feedback that Refresh did something.
      setGeneratedAt(new Date().toISOString())
      setFollowLines([])
      setIsLoading(false)
    }, REFRESH_SPINNER_MS)
  }

  const handleDownload = () => {
    // Build a blob from the currently-visible log view and trigger a download.
    const blob = new Blob([visibleLog], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pod || 'pod'}${container ? '-' + container : ''}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Contextual Navigation */}
      {cluster && (
        <div className="flex items-center gap-6 text-sm">
          {pod && (
            <button
              onClick={() => drillToPod(cluster, namespace, pod)}
              className="flex items-center gap-2 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Box className="w-4 h-4 text-cyan-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.pod')}</span>
              <span className="font-mono text-cyan-400 group-hover:text-cyan-300 transition-colors">{pod}</span>
            </button>
          )}
          {namespace && (
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            </button>
          )}
          <button
            onClick={() => drillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={clusterShort} size="sm" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm disabled:opacity-50"
            aria-label={t('drilldown.logs.tailLinesLabel')}
          >
            {TAIL_LINE_OPTIONS.map((n) => (
              <option key={n} value={n}>{t('drilldown.logs.tailLinesOption', { count: n })}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value as LogLevel)}
              disabled={isLoading}
              className="px-3 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm disabled:opacity-50"
              aria-label={t('drilldown.logs.severityFilterLabel')}
            >
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level === 'ALL' ? t('drilldown.logs.allLevels') : level}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="rounded"
              disabled={isLoading}
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              aria-label={t('drilldown.logs.followLogs')}
            />
            {t('drilldown.logs.followLogs')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isLoading || visibleLogLines.length === 0}
            className="px-3 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card disabled:opacity-50"
          >
            {t('drilldown.logs.download')}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            {t('drilldown.logs.refresh')}
          </button>
        </div>
      </div>

      {/* Tail / generation summary so users can see changes took effect. */}
      <div className="text-xs text-muted-foreground">
        {t('drilldown.logs.showing', { lines: visibleLogLines.length, tail: tailLines })}
        {' · '}
        {t('drilldown.logs.generatedAt', { time: new Date(generatedAt).toLocaleTimeString() })}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <div>
            <div className="font-medium">{t('drilldown.logs.failedToLoad')}</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.logs.loadingLogs')}</span>
        </div>
      )}

      {/* Log Output */}
      {!isLoading && !error && (
        <div
          ref={logContainerRef}
          className="rounded-lg bg-card border border-border p-4 font-mono text-sm overflow-auto max-h-[60vh]"
        >
          <pre className="text-foreground whitespace-pre-wrap">{visibleLog}</pre>
        </div>
      )}

      {/* Informational footer: logs are static mock data until the real log
          streaming API lands. Retain the "coming soon" hint. */}
      {!isLoading && !error && (
        <p className="text-xs text-muted-foreground italic">
          {t('drilldown.logs.mockNotice')}
        </p>
      )}
    </div>
  )
}
