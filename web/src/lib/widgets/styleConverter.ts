/**
 * Style Converter
 *
 * Converts Tailwind CSS classes to inline CSS properties for standalone widgets.
 * This allows widgets to render correctly without a Tailwind build system.
 */

import type { CSSProperties } from 'react'

// Tailwind to inline CSS mappings
const TAILWIND_TO_CSS: Record<string, CSSProperties> = {
  // Display
  flex: { display: 'flex' },
  'inline-flex': { display: 'inline-flex' },
  block: { display: 'block' },
  'inline-block': { display: 'inline-block' },
  grid: { display: 'grid' },
  hidden: { display: 'none' },

  // Flex direction
  'flex-col': { flexDirection: 'column' },
  'flex-row': { flexDirection: 'row' },
  'flex-wrap': { flexWrap: 'wrap' },
  'flex-1': { flex: '1 1 0%' },

  // Alignment
  'items-center': { alignItems: 'center' },
  'items-start': { alignItems: 'flex-start' },
  'items-end': { alignItems: 'flex-end' },
  'justify-center': { justifyContent: 'center' },
  'justify-between': { justifyContent: 'space-between' },
  'justify-start': { justifyContent: 'flex-start' },
  'justify-end': { justifyContent: 'flex-end' },

  // Grid
  'grid-cols-2': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  'grid-cols-3': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  'grid-cols-4': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },

  // Gap
  'gap-1': { gap: '4px' },
  'gap-2': { gap: '8px' },
  'gap-3': { gap: '12px' },
  'gap-4': { gap: '16px' },

  // Padding
  'p-1': { padding: '4px' },
  'p-2': { padding: '8px' },
  'p-3': { padding: '12px' },
  'p-4': { padding: '16px' },
  'px-2': { paddingLeft: '8px', paddingRight: '8px' },
  'px-3': { paddingLeft: '12px', paddingRight: '12px' },
  'px-4': { paddingLeft: '16px', paddingRight: '16px' },
  'py-1': { paddingTop: '4px', paddingBottom: '4px' },
  'py-2': { paddingTop: '8px', paddingBottom: '8px' },

  // Margin
  'm-0': { margin: '0' },
  'mb-1': { marginBottom: '4px' },
  'mb-2': { marginBottom: '8px' },
  'mb-3': { marginBottom: '12px' },
  'mb-4': { marginBottom: '16px' },
  'mt-2': { marginTop: '8px' },
  'mr-2': { marginRight: '8px' },
  'ml-2': { marginLeft: '8px' },

  // Width/Height
  'w-full': { width: '100%' },
  'h-full': { height: '100%' },
  'min-w-0': { minWidth: '0' },

  // Border radius
  rounded: { borderRadius: '4px' },
  'rounded-md': { borderRadius: '6px' },
  'rounded-lg': { borderRadius: '8px' },
  'rounded-xl': { borderRadius: '12px' },
  'rounded-2xl': { borderRadius: '16px' },
  'rounded-full': { borderRadius: '9999px' },

  // Typography
  'text-xs': { fontSize: '12px', lineHeight: '16px' },
  'text-sm': { fontSize: '14px', lineHeight: '20px' },
  'text-base': { fontSize: '16px', lineHeight: '24px' },
  'text-lg': { fontSize: '18px', lineHeight: '28px' },
  'text-xl': { fontSize: '20px', lineHeight: '28px' },
  'text-2xl': { fontSize: '24px', lineHeight: '32px' },
  'text-3xl': { fontSize: '30px', lineHeight: '36px' },
  'font-medium': { fontWeight: 500 },
  'font-semibold': { fontWeight: 600 },
  'font-bold': { fontWeight: 700 },
  'text-center': { textAlign: 'center' },
  truncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Colors - Text
  'text-white': { color: '#ffffff' },
  'text-foreground': { color: '#f9fafb' },
  'text-muted-foreground': { color: '#9ca3af' },
  'text-green-400': { color: '#4ade80' },
  'text-green-500': { color: '#22c55e' },
  'text-red-400': { color: '#f87171' },
  'text-red-500': { color: '#ef4444' },
  'text-yellow-400': { color: '#facc15' },
  'text-yellow-500': { color: '#eab308' },
  'text-orange-400': { color: '#fb923c' },
  'text-blue-400': { color: '#60a5fa' },
  'text-purple-400': { color: '#c084fc' },
  'text-cyan-400': { color: '#22d3ee' },

  // Colors - Background
  'bg-transparent': { backgroundColor: 'transparent' },
  'bg-card': { backgroundColor: 'rgba(17, 24, 39, 0.8)' },
  'bg-secondary': { backgroundColor: 'rgba(31, 41, 55, 0.5)' },
  'bg-green-500/10': { backgroundColor: 'rgba(34, 197, 94, 0.1)' },
  'bg-green-500/20': { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  'bg-red-500/10': { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  'bg-red-500/20': { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  'bg-yellow-500/10': { backgroundColor: 'rgba(234, 179, 8, 0.1)' },
  'bg-yellow-500/20': { backgroundColor: 'rgba(234, 179, 8, 0.2)' },
  'bg-purple-500/10': { backgroundColor: 'rgba(168, 85, 247, 0.1)' },
  'bg-purple-500/20': { backgroundColor: 'rgba(168, 85, 247, 0.2)' },
  'bg-blue-500/10': { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
  'bg-blue-500/20': { backgroundColor: 'rgba(59, 130, 246, 0.2)' },

  // Border
  border: { borderWidth: '1px', borderStyle: 'solid' },
  'border-0': { borderWidth: '0' },
  'border-border': { borderColor: 'rgba(55, 65, 81, 0.5)' },
  'border-border/30': { borderColor: 'rgba(55, 65, 81, 0.3)' },
  'border-border/50': { borderColor: 'rgba(55, 65, 81, 0.5)' },
  'border-green-500/20': { borderColor: 'rgba(34, 197, 94, 0.2)' },
  'border-red-500/20': { borderColor: 'rgba(239, 68, 68, 0.2)' },
  'border-l-2': { borderLeftWidth: '2px' },
  'border-l-4': { borderLeftWidth: '4px' },
  'border-l-green-500': { borderLeftColor: '#22c55e' },
  'border-l-red-500': { borderLeftColor: '#ef4444' },
  'border-l-yellow-500': { borderLeftColor: '#eab308' },

  // Overflow
  'overflow-hidden': { overflow: 'hidden' },
  'overflow-auto': { overflow: 'auto' },

  // Position
  relative: { position: 'relative' },
  absolute: { position: 'absolute' },
  fixed: { position: 'fixed' },
  'inset-0': { top: 0, right: 0, bottom: 0, left: 0 },

  // Effects
  'opacity-50': { opacity: 0.5 },
  'opacity-75': { opacity: 0.75 },

  // Special - Glass effect
  glass: {
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
  },
}

// Convert a string of Tailwind classes to inline CSS
export function tailwindToCSS(classes: string): CSSProperties {
  if (!classes) return {}

  return classes.split(/\s+/).reduce<CSSProperties>((acc, cls) => {
    const trimmed = cls.trim()
    if (trimmed && TAILWIND_TO_CSS[trimmed]) {
      return { ...acc, ...TAILWIND_TO_CSS[trimmed] }
    }
    return acc
  }, {})
}

// Generate CSS object string for widget code
export function cssToObjectString(styles: CSSProperties, indent = 2): string {
  const entries = Object.entries(styles)
  if (entries.length === 0) return '{}'

  const lines = entries.map(([key, value]) => {
    const cssValue = typeof value === 'number' ? `${value}px` : value
    return `${' '.repeat(indent + 2)}${key}: '${cssValue}'`
  })

  return `{\n${lines.join(',\n')}\n${' '.repeat(indent)}}`
}

// Pre-built widget styles
export const WIDGET_STYLES = {
  // Container for full card widget
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '16px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#f9fafb',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  },

  // Compact stat block
  statBlock: {
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    backdropFilter: 'blur(8px)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Inter, -apple-system, sans-serif',
    color: '#f9fafb',
    minWidth: '70px',
  },

  // Stat value text
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1.2,
  },

  // Stat label text
  statLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: '2px',
  },

  // Card title
  cardTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#f9fafb',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  // Grid container for templates
  grid: {
    display: 'grid',
    gap: '12px',
  },

  // Row container
  row: {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: '8px',
    alignItems: 'center',
  },

  // Column container
  column: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },

  // Status indicator dot
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
  },

  // Health colors
  healthyColor: '#22c55e',
  warningColor: '#eab308',
  errorColor: '#ef4444',
  infoColor: '#3b82f6',
  purpleColor: '#9333ea',
}

// Generate complete styles object for widget code
export function generateWidgetStyles(): string {
  return `const styles = {
  card: ${JSON.stringify(WIDGET_STYLES.card, null, 4).replace(/"/g, "'")},
  statBlock: ${JSON.stringify(WIDGET_STYLES.statBlock, null, 4).replace(/"/g, "'")},
  statValue: ${JSON.stringify(WIDGET_STYLES.statValue, null, 4).replace(/"/g, "'")},
  statLabel: ${JSON.stringify(WIDGET_STYLES.statLabel, null, 4).replace(/"/g, "'")},
  cardTitle: ${JSON.stringify(WIDGET_STYLES.cardTitle, null, 4).replace(/"/g, "'")},
  grid: ${JSON.stringify(WIDGET_STYLES.grid, null, 4).replace(/"/g, "'")},
  row: ${JSON.stringify(WIDGET_STYLES.row, null, 4).replace(/"/g, "'")},
  column: ${JSON.stringify(WIDGET_STYLES.column, null, 4).replace(/"/g, "'")},
  statusDot: ${JSON.stringify(WIDGET_STYLES.statusDot, null, 4).replace(/"/g, "'")},
  colors: {
    healthy: '${WIDGET_STYLES.healthyColor}',
    warning: '${WIDGET_STYLES.warningColor}',
    error: '${WIDGET_STYLES.errorColor}',
    info: '${WIDGET_STYLES.infoColor}',
    purple: '${WIDGET_STYLES.purpleColor}',
  },
  dragHandle: {
    padding: '4px 0',
    marginBottom: '4px',
    display: 'flex',
    justifyContent: 'center',
    cursor: 'grab',
    pointerEvents: 'auto',
  },
  dragIndicator: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '2px',
  },
};`
}

// Generate draggable widget infrastructure (shared by all widgets)
export function generateWidgetShell(widgetName: string, consoleUrl: string): string {
  const storageKey = `ks-widget-pos-${widgetName}`
  return `import { css, run } from "uebersicht";

const CONSOLE_URL = '${consoleUrl}';
const STORAGE_KEY = '${storageKey}';

// --- Draggable position persistence ---
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let posStart = { x: 0, y: 0 };
let dragElement = null;

const getStoredPosition = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return { top: 20, left: 20 };
};
const savePosition = (pos) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch (e) {}
};
let widgetPosition = getStoredPosition();

const handleDragStart = (e) => {
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  posStart = { ...widgetPosition };
  dragElement = e.target.closest('.widget-container');
  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
  e.preventDefault();
};
const handleDragMove = (e) => {
  if (!isDragging || !dragElement) return;
  widgetPosition = {
    top: Math.max(0, posStart.top + (e.clientY - dragStart.y)),
    left: Math.max(0, posStart.left + (e.clientX - dragStart.x)),
  };
  dragElement.style.top = widgetPosition.top + 'px';
  dragElement.style.left = widgetPosition.left + 'px';
};
const handleDragEnd = () => {
  isDragging = false;
  dragElement = null;
  savePosition(widgetPosition);
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
};

const openConsole = (path = '') => { run(\`open "\${CONSOLE_URL}\${path}"\`); };

export const className = css\`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: #fff;
  user-select: none;
  pointer-events: none;
  .widget-container { transition: background 0.2s ease, box-shadow 0.2s ease; }
  .widget-container:hover {
    background: rgba(17, 24, 39, 0.98) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
  }
  .drag-handle { cursor: grab; }
  .drag-handle:active { cursor: grabbing; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
\`;`
}
