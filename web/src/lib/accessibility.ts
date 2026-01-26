import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  Clock,
  Loader2,
  LucideIcon,
} from 'lucide-react'

// localStorage key for accessibility settings
const ACCESSIBILITY_STORAGE_KEY = 'accessibility-settings'

export type StatusLevel =
  | 'healthy'
  | 'success'
  | 'warning'
  | 'error'
  | 'critical'
  | 'info'
  | 'unknown'
  | 'pending'
  | 'loading'

export type PatternType = 'solid' | 'striped' | 'dotted' | 'dashed' | 'none'
export type ShapeType = 'circle' | 'triangle' | 'square' | 'diamond' | 'none'

export interface AccessibleStatusConfig {
  icon: LucideIcon
  pattern: PatternType
  shape: ShapeType
  colorClass: string
  bgClass: string
  borderClass: string
  textClass: string
  label: string
  ariaLabel: string
}

/**
 * Status configuration for color blind accessibility
 * Each status has a unique combination of: icon, pattern, shape, and color
 * This ensures status is distinguishable even without color perception
 */
export const STATUS_CONFIG: Record<StatusLevel, AccessibleStatusConfig> = {
  healthy: {
    icon: CheckCircle,
    pattern: 'solid',
    shape: 'circle',
    colorClass: 'text-green-400',
    bgClass: 'bg-green-500/20',
    borderClass: 'border-green-500/30',
    textClass: 'text-green-400',
    label: 'Healthy',
    ariaLabel: 'Status: Healthy',
  },
  success: {
    icon: CheckCircle,
    pattern: 'solid',
    shape: 'circle',
    colorClass: 'text-green-400',
    bgClass: 'bg-green-500/20',
    borderClass: 'border-green-500/30',
    textClass: 'text-green-400',
    label: 'Success',
    ariaLabel: 'Status: Success',
  },
  warning: {
    icon: AlertTriangle,
    pattern: 'striped',
    shape: 'triangle',
    colorClass: 'text-yellow-400',
    bgClass: 'bg-yellow-500/20',
    borderClass: 'border-yellow-500/30',
    textClass: 'text-yellow-400',
    label: 'Warning',
    ariaLabel: 'Status: Warning',
  },
  error: {
    icon: XCircle,
    pattern: 'dotted',
    shape: 'square',
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/30',
    textClass: 'text-red-400',
    label: 'Error',
    ariaLabel: 'Status: Error',
  },
  critical: {
    icon: AlertCircle,
    pattern: 'dashed',
    shape: 'diamond',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-600/20',
    borderClass: 'border-red-600/30',
    textClass: 'text-red-500',
    label: 'Critical',
    ariaLabel: 'Status: Critical',
  },
  info: {
    icon: Info,
    pattern: 'solid',
    shape: 'circle',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/20',
    borderClass: 'border-blue-500/30',
    textClass: 'text-blue-400',
    label: 'Info',
    ariaLabel: 'Status: Information',
  },
  unknown: {
    icon: HelpCircle,
    pattern: 'none',
    shape: 'none',
    colorClass: 'text-gray-400',
    bgClass: 'bg-gray-500/20',
    borderClass: 'border-gray-500/30',
    textClass: 'text-gray-400',
    label: 'Unknown',
    ariaLabel: 'Status: Unknown',
  },
  pending: {
    icon: Clock,
    pattern: 'striped',
    shape: 'circle',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
    borderClass: 'border-orange-500/30',
    textClass: 'text-orange-400',
    label: 'Pending',
    ariaLabel: 'Status: Pending',
  },
  loading: {
    icon: Loader2,
    pattern: 'none',
    shape: 'circle',
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/20',
    borderClass: 'border-purple-500/30',
    textClass: 'text-purple-400',
    label: 'Loading',
    ariaLabel: 'Status: Loading',
  },
}

/**
 * Map common status strings to StatusLevel
 */
export function normalizeStatus(status: string): StatusLevel {
  const normalized = status.toLowerCase().trim()

  // Healthy/Success variants
  if (['healthy', 'ok', 'up', 'running', 'available', 'ready', 'active', 'synced'].includes(normalized)) {
    return 'healthy'
  }
  if (['success', 'succeeded', 'complete', 'completed', 'passed'].includes(normalized)) {
    return 'success'
  }

  // Warning variants
  if (['warning', 'warn', 'degraded', 'progressing', 'pending', 'waiting'].includes(normalized)) {
    return 'warning'
  }

  // Error variants
  if (['error', 'err', 'failed', 'failure', 'unhealthy', 'down', 'notready', 'crashloopbackoff'].includes(normalized)) {
    return 'error'
  }

  // Critical variants
  if (['critical', 'crit', 'fatal', 'emergency', 'severe'].includes(normalized)) {
    return 'critical'
  }

  // Info variants
  if (['info', 'information', 'normal', 'notice'].includes(normalized)) {
    return 'info'
  }

  // Pending variants
  if (['pending', 'scheduled', 'queued', 'waiting'].includes(normalized)) {
    return 'pending'
  }

  // Loading variants
  if (['loading', 'initializing', 'starting', 'containerscreating'].includes(normalized)) {
    return 'loading'
  }

  return 'unknown'
}

/**
 * Get the CSS class for a pattern type (used in color blind mode)
 */
export function getPatternClass(pattern: PatternType): string {
  switch (pattern) {
    case 'striped':
      return 'bg-stripes'
    case 'dotted':
      return 'bg-dots'
    case 'dashed':
      return 'bg-dashes'
    default:
      return ''
  }
}

/**
 * Accessibility settings interface
 */
export interface AccessibilitySettings {
  colorBlindMode: boolean
  reduceMotion: boolean
  highContrast: boolean
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  colorBlindMode: false,
  reduceMotion: false,
  highContrast: false,
}

/**
 * Load accessibility settings from localStorage
 */
export function loadAccessibilitySettings(): AccessibilitySettings {
  try {
    const stored = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (error) {
    console.error('Failed to load accessibility settings:', error)
  }
  return DEFAULT_SETTINGS
}

/**
 * Save accessibility settings to localStorage
 */
export function saveAccessibilitySettings(settings: AccessibilitySettings): void {
  try {
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save accessibility settings:', error)
  }
}

/**
 * Update a single accessibility setting
 */
export function updateAccessibilitySetting<K extends keyof AccessibilitySettings>(
  key: K,
  value: AccessibilitySettings[K]
): AccessibilitySettings {
  const current = loadAccessibilitySettings()
  const updated = { ...current, [key]: value }
  saveAccessibilitySettings(updated)
  return updated
}

/**
 * Severity levels for alerts, issues, and risk assessment
 * Ordered from most to least severe
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none'

/**
 * Standard severity color configuration
 * Use these for consistent severity-based styling across all cards
 */
export const SEVERITY_COLORS: Record<SeverityLevel, {
  text: string
  bg: string
  border: string
  solid: string
}> = {
  critical: {
    text: 'text-red-500',
    bg: 'bg-red-600/20',
    border: 'border-red-600/30',
    solid: 'bg-red-600',
  },
  high: {
    text: 'text-red-400',
    bg: 'bg-red-500/20',
    border: 'border-red-500/30',
    solid: 'bg-red-500',
  },
  medium: {
    text: 'text-orange-400',
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/30',
    solid: 'bg-orange-500',
  },
  low: {
    text: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/30',
    solid: 'bg-yellow-500',
  },
  info: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/30',
    solid: 'bg-blue-500',
  },
  none: {
    text: 'text-gray-400',
    bg: 'bg-gray-500/20',
    border: 'border-gray-500/30',
    solid: 'bg-gray-500',
  },
}

/**
 * Get severity colors for a given severity level
 * Returns a safe default if severity is not recognized
 */
export function getSeverityColors(severity: string): typeof SEVERITY_COLORS['info'] {
  const normalized = severity.toLowerCase().trim()

  if (normalized in SEVERITY_COLORS) {
    return SEVERITY_COLORS[normalized as SeverityLevel]
  }

  // Map common aliases
  if (['error', 'danger', 'fatal', 'emergency'].includes(normalized)) {
    return SEVERITY_COLORS.critical
  }
  if (['warn', 'warning', 'caution'].includes(normalized)) {
    return SEVERITY_COLORS.medium
  }

  return SEVERITY_COLORS.info
}
