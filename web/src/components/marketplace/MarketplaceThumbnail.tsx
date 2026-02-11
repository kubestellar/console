interface ThumbnailConfig {
  gradient: [string, string]
  icon: string // SVG path data
  label: string
}

const ITEM_THUMBNAILS: Record<string, ThumbnailConfig> = {
  'sre-overview': {
    gradient: ['#7c3aed', '#3b82f6'],
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2', // Activity
    label: 'SRE',
  },
  'security-audit': {
    gradient: ['#ef4444', '#f97316'],
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Shield
    label: 'SEC',
  },
  'gitops-pipeline': {
    gradient: ['#10b981', '#06b6d4'],
    icon: 'M6 3v12M18 9a3 3 0 100 6 3 3 0 000-6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 15l-6 6', // GitBranch
    label: 'OPS',
  },
}

const TYPE_FALLBACKS: Record<string, ThumbnailConfig> = {
  dashboard: {
    gradient: ['#6366f1', '#8b5cf6'],
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', // LayoutGrid
    label: '',
  },
  'card-preset': {
    gradient: ['#06b6d4', '#3b82f6'],
    icon: 'M21 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3m18 0v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8m18 0H3', // Card
    label: '',
  },
  theme: {
    gradient: ['#ec4899', '#a855f7'],
    icon: 'M12 2a10 10 0 000 20c.6 0 1-.4 1-1v-1.5c0-.8-.7-1.5-1.5-1.5H9a2 2 0 01-2-2v-1a2 2 0 012-2h1a2 2 0 002-2V8a2 2 0 012-2h.5', // Palette
    label: '',
  },
}

export function MarketplaceThumbnail({ itemId, itemType, className }: {
  itemId: string
  itemType: 'dashboard' | 'card-preset' | 'theme'
  className?: string
}) {
  const config = ITEM_THUMBNAILS[itemId] || TYPE_FALLBACKS[itemType] || TYPE_FALLBACKS.dashboard

  return (
    <div className={`h-36 overflow-hidden relative ${className || ''}`}>
      <svg viewBox="0 0 400 144" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`grad-${itemId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.gradient[0]} stopOpacity="0.25" />
            <stop offset="100%" stopColor={config.gradient[1]} stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id={`icon-grad-${itemId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={config.gradient[0]} stopOpacity="0.6" />
            <stop offset="100%" stopColor={config.gradient[1]} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {/* Background */}
        <rect width="400" height="144" fill={`url(#grad-${itemId})`} />
        {/* Grid dots pattern */}
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 16 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={25 + col * 25}
              cy={12 + row * 18}
              r="1"
              fill={config.gradient[0]}
              opacity={0.15}
            />
          ))
        )}
        {/* Center icon */}
        <g transform="translate(176, 48)" opacity="0.5">
          <path
            d={config.icon}
            fill="none"
            stroke={`url(#icon-grad-${itemId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="scale(2)"
          />
        </g>
        {/* Decorative lines */}
        <line x1="0" y1="143" x2="400" y2="143" stroke={config.gradient[0]} strokeOpacity="0.2" strokeWidth="1" />
      </svg>
    </div>
  )
}
