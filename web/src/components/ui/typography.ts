/**
 * Semantic typography class constants.
 * Use these instead of ad-hoc text-* / font-* combinations.
 *
 * Adoption: replace `className="text-2xl font-bold text-foreground"`
 * with `className={TEXT.pageTitle}` (or use cn() to merge with other classes).
 *
 * Each constant matches the most common existing pattern for that semantic
 * purpose, so adoption is a straight class-string swap with no visual change.
 */
export const TEXT = {
  /** Page titles — DashboardHeader h1, standalone page headings */
  pageTitle: 'text-2xl font-bold text-foreground',

  /** Card titles — CardWrapper h3 headers */
  cardTitle: 'text-sm font-medium text-foreground',

  /** Section labels — settings group headings, sidebar dividers (uppercase) */
  sectionLabel: 'text-xs font-semibold text-muted-foreground uppercase tracking-wider',

  /** Sub-section labels — modal sections, chart titles, card group headings */
  subSectionLabel: 'text-sm font-medium text-muted-foreground',

  /** Body text — default content */
  body: 'text-sm text-foreground',

  /** Small body — secondary content, descriptions */
  bodySmall: 'text-xs text-foreground',

  /** Caption — timestamps, secondary info, helper text, stat sublabels */
  caption: 'text-xs text-muted-foreground',

  /** Code — YAML, JSON, CLI output, inline code */
  code: 'text-xs font-mono text-foreground',

  /** Stat value — large numbers in stat blocks (default numeric mode) */
  statValue: 'text-2xl font-bold text-foreground',

  /** Stat label — labels under stat values */
  statLabel: 'text-xs text-muted-foreground',

  /** Modal title — BaseModal.Header h2, ConfirmDialog headings */
  modalTitle: 'text-lg font-semibold text-foreground',

  /** Button text (reference only — use Button component instead) */
  button: 'text-sm font-medium',
} as const
