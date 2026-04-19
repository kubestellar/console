/**
 * Shared spacing tokens for ECharts HTML tooltip strings.
 *
 * ECharts tooltip formatters must return raw HTML strings rendered outside
 * the React tree, so Tailwind utility classes are not applied. To keep the
 * 4px grid consistent with the rest of the app, we centralize the pixel
 * values used inside those HTML strings here instead of hardcoding them.
 *
 * All values follow the 4px spacing scale used across the app.
 */

// 1px — minimal vertical padding between tooltip rows (sub-unit border trim)
export const TOOLTIP_ROW_PADDING_PX = 1

// 2px — extra-small vertical gap (used for secondary metadata rows)
export const TOOLTIP_TIGHT_GAP_PX = 2

// 4px — header spacing (bottom margin under tooltip title)
export const TOOLTIP_HEADER_MARGIN_PX = 4

// 6px — inline gap between color swatch and label
export const TOOLTIP_INLINE_GAP_PX = 6

// 8px — color swatch (dot) diameter
export const TOOLTIP_SWATCH_SIZE_PX = 8
