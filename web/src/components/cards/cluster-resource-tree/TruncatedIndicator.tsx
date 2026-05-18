import { BASE_PADDING_LEFT_PX, INDENT_PER_LEVEL_PX } from './TreeRenderer'

interface TruncatedIndicatorProps {
  total: number
  shown: number
  indent: number
}

export function TruncatedIndicator({ total, shown, indent }: TruncatedIndicatorProps) {
  if (shown >= total) return null

  return (
    <div
      className="text-xs text-muted-foreground py-1 px-2"
      style={{ paddingLeft: `${indent * INDENT_PER_LEVEL_PX + BASE_PADDING_LEFT_PX}px` }}
    >
      +{total - shown} more
    </div>
  )
}
