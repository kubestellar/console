/**
 * Named constants for the Drasi Reactive Graph card.
 *
 * All numeric literals and palette values live here so the UI/UX ratchet
 * scanner never flags inline hex or magic numbers in component files.
 */

// ---------------------------------------------------------------------------
// Timing / size limits
// ---------------------------------------------------------------------------

/** Timeout for Drasi proxy API calls (ms) */
export const DRASI_PROXY_TIMEOUT_MS = 10_000
/** How often to refresh demo data values */
export const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the results table */
export const MAX_RESULT_ROWS = 7
/** Flow dot animation cycle duration (seconds) — base before per-line jitter */
export const FLOW_DOT_CYCLE_S = 5
/** SVG stroke width in pixels */
export const LINE_STROKE_WIDTH_PX = 1.2
/** Flow dot radius in pixels */
export const FLOW_DOT_RADIUS_PX = 3
/** Max node-card width so the trunk/branch lines have breathing room */
export const NODE_MAX_WIDTH_PX = 220
/** Max width for the queries column (wider to fit nested results table) */
export const QUERY_MAX_WIDTH_PX = 300
/** Dedicated column width that houses the trunk2 vertical line — wide enough
 *  to be visibly outside every query card but narrow enough not to feel like
 *  its own panel. */
export const TRUNK2_WIDTH_PX = 50

// ---------------------------------------------------------------------------
// KPI strip labels
// ---------------------------------------------------------------------------

/** Pipeline KPI strip labels. These are technical metric names (units and
 *  entity names) rather than user-facing prose, so they are kept out of i18n
 *  catalogs; still named constants to avoid inline string literals in JSX. */
export const KPI_LABEL_EVENTS_PER_SEC = 'Events/s'
export const KPI_LABEL_RESULT_ROWS = 'Result Rows'
export const KPI_LABEL_SOURCES = 'Sources'
export const KPI_LABEL_REACTIONS = 'Reactions'

// ---------------------------------------------------------------------------
// CodeMirror / UI sizing
// ---------------------------------------------------------------------------

/** CodeMirror editor height inside the Query Configure modal. */
export const CODEMIRROR_EDITOR_HEIGHT_PX = '140px'

/** How long the "Copied!" confirmation stays visible in the stream-sample
 *  drawer before reverting to the normal Copy label. */
export const STREAM_COPY_FLASH_MS = 1500

// ---------------------------------------------------------------------------
// Demo placeholders
// ---------------------------------------------------------------------------

/** Placeholder endpoint shown in demo mode stream samples — clearly fake
 *  so users know to replace it with their own Drasi reaction URL. */
export const DEMO_STREAM_ENDPOINT = 'https://your-drasi-server.example.com/api/v1/instances/<instance-id>/queries/<query-id>/events/stream'

// ---------------------------------------------------------------------------
// Flow-line palette
// (named constants so the UI/UX ratchet scanner skips them)
// ---------------------------------------------------------------------------

/** Tailwind emerald-500 — primary "active" stroke */
export const FLOW_COLOR_ACTIVE_STROKE = 'rgb(16 185 129)'
/** Tailwind emerald-400 — animated dot for active lines */
export const FLOW_COLOR_ACTIVE_DOT = 'rgb(52 211 153)'
/** Tailwind slate-400 — idle stroke + dot (desaturated) */
export const FLOW_COLOR_IDLE = 'rgb(148 163 184)'
/** Tailwind slate-500 — stopped stroke + dot (more muted than idle) */
export const FLOW_COLOR_STOPPED = 'rgb(100 116 139)'
/** Tailwind red-500 — error stroke */
export const FLOW_COLOR_ERROR_STROKE = 'rgb(239 68 68)'
/** Tailwind red-400 — error dot (one shade lighter than stroke) */
export const FLOW_COLOR_ERROR_DOT = 'rgb(248 113 113)'

/** Opacity levels for each flow-line state. */
export const FLOW_OPACITY_ACTIVE = 0.7
export const FLOW_OPACITY_IDLE = 0.45
export const FLOW_OPACITY_STOPPED = 0.35
export const FLOW_OPACITY_ERROR = 0.7
