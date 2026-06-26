/**
 * Drag-to-resize handle rendered on the left edge of the mission sidebar
 * (desktop, non-fullscreen). Dragging left increases the sidebar width.
 */
export function SidebarResizeHandle({
  onResizeStart,
  label,
}: {
  onResizeStart: (e: React.MouseEvent) => void
  label: string
}) {
  return (
    <div
      onMouseDown={onResizeStart}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-50 group"
    >
      <div className="absolute inset-y-0 left-0 w-0.5 bg-border group-hover:bg-primary/50 transition-colors" />
    </div>
  )
}
