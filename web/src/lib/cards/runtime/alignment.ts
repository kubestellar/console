/**
 * Column alignment allowlist — keeps unvalidated user config from producing
 * garbage Tailwind classes like "text-foo" that silently drop styles.
 */

const VALID_ALIGN_VALUES = ['left', 'center', 'right'] as const
export type ValidAlign = (typeof VALID_ALIGN_VALUES)[number]
export const DEFAULT_ALIGN: ValidAlign = 'left'

export function normalizeAlign(align: string | undefined): ValidAlign {
  return (VALID_ALIGN_VALUES as readonly string[]).includes(align ?? '')
    ? (align as ValidAlign)
    : DEFAULT_ALIGN
}
