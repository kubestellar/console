/** CSS-only mockup of the console dashboard — creates visual curiosity */
export function DashboardMockup() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-30 blur-[2px]">
      {/* Sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-[52px] bg-card border-r border-foreground/5">
        {/* Logo area */}
        <div className="h-12 flex items-center justify-center border-b border-foreground/5">
          <div className="w-6 h-6 rounded bg-purple-500/30" />
        </div>
        {/* Nav items */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 flex items-center justify-center">
            <div className={`w-5 h-5 rounded ${i === 0 ? 'bg-purple-500/40' : 'bg-foreground/5'}`} />
          </div>
        ))}
      </div>

      {/* Main content area */}
      <div className="ml-[52px] p-4">
        {/* Top bar */}
        <div className="h-10 mb-4 flex items-center gap-3">
          <div className="w-32 h-6 rounded bg-foreground/5" />
          <div className="flex-1" />
          <div className="w-8 h-8 rounded-full bg-foreground/5" />
          <div className="w-8 h-8 rounded-full bg-foreground/5" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Large card */}
          <div className="col-span-2 h-48 rounded-xl bg-card border border-foreground/5 p-4">
            <div className="w-24 h-3 rounded bg-foreground/8 mb-3" />
            <div className="grid grid-cols-4 gap-2 h-32">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-foreground/2 border border-foreground/5 p-2">
                  <div className="w-full h-2 rounded bg-foreground/5 mb-2" />
                  <div className="w-3/4 h-6 rounded bg-purple-500/10" />
                </div>
              ))}
            </div>
          </div>
          {/* Tall card */}
          <div className="row-span-2 rounded-xl bg-card border border-foreground/5 p-4">
            <div className="w-20 h-3 rounded bg-foreground/8 mb-3" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-red-500/40' : i < 4 ? 'bg-yellow-500/30' : 'bg-green-500/30'}`} />
                <div className="flex-1 h-2 rounded bg-foreground/5" />
              </div>
            ))}
          </div>
          {/* Bottom row cards */}
          <div className="h-40 rounded-xl bg-card border border-foreground/5 p-4">
            <div className="w-16 h-3 rounded bg-foreground/8 mb-3" />
            <div className="h-24 rounded bg-linear-to-t from-blue-500/5 to-transparent" />
          </div>
          <div className="h-40 rounded-xl bg-card border border-foreground/5 p-4">
            <div className="w-20 h-3 rounded bg-foreground/8 mb-3" />
            <div className="flex gap-1 h-24 items-end">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-purple-500/15"
                  style={{ height: `${20 + Math.sin(i * 0.8) * 40 + 30}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dim overlay to darken the mockup */}
      <div className="absolute inset-0 bg-background/40" />
    </div>
  )
}

/** Small badge indicating whether a mission section has content */
export function SectionBadge({ present, label }: { present: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs rounded-full border ${
      present
        ? 'text-green-400/70 bg-green-500/8 border-green-500/20'
        : 'text-foreground/15 bg-foreground/2 border-foreground/5'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${present ? 'bg-green-500/60' : 'bg-foreground/10'}`} />
      {label}
    </span>
  )
}
