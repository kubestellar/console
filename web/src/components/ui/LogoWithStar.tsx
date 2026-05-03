import { cn } from '../../lib/cn'
import { useBranding } from '../../hooks/useBranding'

interface LogoWithStarProps {
  className?: string
  /** Size of the logo image itself */
  logoClassName?: string
  alt?: string
  /** Override branding's showStarDecoration — set false to hide the sparkle overlay */
  showStar?: boolean
}

/**
 * Project logo with optional "star treatment" — a 4-pointed sparkle star
 * and two flanking plus signs in purple, positioned at the upper-right.
 * Star decoration is controlled by branding config (KubeStellar-specific).
 */
export function LogoWithStar({ className, logoClassName, alt, showStar }: LogoWithStarProps) {
  const { logoUrl, appShortName, showStarDecoration } = useBranding()

  /** Respect explicit prop override; fall back to branding config */
  const renderStar = showStar ?? showStarDecoration

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <img
        src={logoUrl}
        alt={alt || appShortName}
        className={cn('w-full h-full', logoClassName)}
      />
      {/* Star treatment overlay — only shown for KubeStellar branding */}
      {renderStar && (
        <svg
          className="absolute top-[-15%] right-[-20%] w-[55%] h-[55%] pointer-events-none"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* 4-pointed sparkle star — center of the overlay */}
          <path
            d="M20 8 L22.5 17.5 L32 20 L22.5 22.5 L20 32 L17.5 22.5 L8 20 L17.5 17.5 Z"
            fill="none"
            stroke="url(#starGradient)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Large plus sign — upper-right of star */}
          <line x1="33" y1="5" x2="33" y2="11" stroke="url(#plusGradient)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="30" y1="8" x2="36" y2="8" stroke="url(#plusGradient)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Small plus sign — lower-left of star, near logo edge */}
          <line x1="6" y1="13" x2="6" y2="17" stroke="url(#plusGradient)" strokeWidth="1" strokeLinecap="round" />
          <line x1="4" y1="15" x2="8" y2="15" stroke="url(#plusGradient)" strokeWidth="1" strokeLinecap="round" />
          <defs>
            <linearGradient id="starGradient" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id="plusGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  )
}
