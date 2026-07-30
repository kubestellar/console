/**
 * Test and Storybook string constants
 * Extracted for i18n readiness and consistency across test files
 */

export const TEST_STRINGS = {
  // Card test strings
  card: {
    next: 'Next',
    trigger: 'Trigger',
    ctrl: 'Ctrl',
    refresh: 'Refresh',
  },
  
  // Modal test strings
  modal: {
    back: 'Back',
    close: 'Close',
  },
  
  // Unified demo test strings
  unified: {
    toggle: 'Toggle',
    regen: 'Regen',
    refetch: 'Refetch',
  },
  
  // Dashboard test strings
  dashboard: {
    custom: 'Custom',
    close: 'Close',
    add: 'Add',
    apply: 'Apply',
  },
  
  // Storybook Button variants
  button: {
    primary: 'Primary',
    secondary: 'Secondary',
    danger: 'Danger',
    ghost: 'Ghost',
    accent: 'Accent',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
  },
  
  // Storybook StatusBadge colors
  statusBadge: {
    green: 'Green',
    red: 'Red',
    yellow: 'Yellow',
    blue: 'Blue',
    purple: 'Purple',
    orange: 'Orange',
    cyan: 'Cyan',
    gray: 'Gray',
  },
} as const
