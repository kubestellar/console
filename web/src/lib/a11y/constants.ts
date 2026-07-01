// WCAG 2.1 compliance level definitions
export const WCAG_LEVEL = {
  A: 'A',
  AA: 'AA',
  AAA: 'AAA',
} as const

export type WcagLevel = (typeof WCAG_LEVEL)[keyof typeof WCAG_LEVEL]

// Target compliance level for this project
export const TARGET_WCAG_LEVEL: WcagLevel = WCAG_LEVEL.AA

// WCAG 2.1 SC 1.4.3 — minimum contrast ratio for normal text (< 18pt / < 14pt bold)
export const MIN_CONTRAST_RATIO_NORMAL = 4.5

// WCAG 2.1 SC 1.4.3 — minimum contrast ratio for large text (>= 18pt / >= 14pt bold)
export const MIN_CONTRAST_RATIO_LARGE = 3

// WCAG 2.1 SC 1.4.6 (AAA) — enhanced contrast ratio for normal text
export const ENHANCED_CONTRAST_RATIO_NORMAL = 7

// WCAG 2.1 SC 1.4.6 (AAA) — enhanced contrast ratio for large text
export const ENHANCED_CONTRAST_RATIO_LARGE = 4.5

// WCAG 2.1 SC 1.4.11 — minimum contrast ratio for non-text UI components and graphical objects
export const MIN_CONTRAST_RATIO_UI_COMPONENT = 3

// Large text threshold in CSS px (18pt = 24px)
export const LARGE_TEXT_THRESHOLD_PX = 24

// Bold large text threshold in CSS px (14pt bold = approximately 18.67px)
export const BOLD_LARGE_TEXT_THRESHOLD_PX = 18.67

// WCAG 2.1 SC 2.4.7 — focus indicator minimum outline width in px
export const FOCUS_OUTLINE_WIDTH_PX = 2

// Focus outline offset in px (prevents outline from overlapping content)
export const FOCUS_OUTLINE_OFFSET_PX = 2

// WCAG 2.1 SC 2.4.13 (AAA, but good practice) — focus indicator minimum area in CSS px
export const FOCUS_INDICATOR_MIN_AREA_PX = 2

// Standard focus outline style matching the project's design system
export const FOCUS_OUTLINE_STYLE = `${FOCUS_OUTLINE_WIDTH_PX}px solid` as const

// Required ARIA landmark roles for page-level structure (WCAG 2.4.1, 1.3.1)
export const REQUIRED_LANDMARKS = [
  'banner',
  'main',
  'contentinfo',
  'navigation',
] as const

export type RequiredLandmark = (typeof REQUIRED_LANDMARKS)[number]

// Landmark descriptions for audit reporting
export const LANDMARK_DESCRIPTIONS: Record<RequiredLandmark, string> = {
  banner: 'Site header — <header> or role="banner"',
  main: 'Primary content — <main> or role="main"',
  contentinfo: 'Site footer — <footer> or role="contentinfo"',
  navigation: 'Navigation region — <nav> or role="navigation"',
}

// WCAG 2.1 SC 2.2.1 — minimum timing thresholds in ms
export const MIN_AUTO_DISMISS_MS = 20_000
export const MIN_SESSION_TIMEOUT_WARNING_MS = 20_000

// WCAG 2.1 SC 1.4.4 — text must be resizable up to 200% without loss
export const MAX_TEXT_RESIZE_PERCENT = 200

// axe-core impact levels mapped to WCAG severity
export const AXE_IMPACT_TO_WCAG: Record<string, WcagLevel | 'fails-all'> = {
  critical: 'fails-all',
  serious: WCAG_LEVEL.A,
  moderate: WCAG_LEVEL.AA,
  minor: WCAG_LEVEL.AAA,
}

// axe-core rule tags that correspond to WCAG 2.1 AA
export const AXE_WCAG_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
] as const
