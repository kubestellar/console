import { useEffect } from 'react'
import { emitWhiteLabelViewed } from '../lib/analytics'
import {
  HeroSection,
  HighlightsSection,
  VisibilityTableSection,
  DeploymentSection,
  BrandingReference,
  FooterCTASection,
} from './WhiteLabel.sections'

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export function WhiteLabel() {
  useEffect(() => {
    emitWhiteLabelViewed()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <HeroSection />
      <HighlightsSection />
      <VisibilityTableSection />
      <DeploymentSection />
      <BrandingReference />
      <FooterCTASection />
    </div>
  )
}

export default WhiteLabel
