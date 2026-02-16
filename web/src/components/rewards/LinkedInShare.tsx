/**
 * LinkedIn Share component for sharing KubeStellar and earning coins
 */

import { useState } from 'react'
import { Linkedin, Share2, Coins, CheckCircle2 } from 'lucide-react'
import { useRewards } from '../../hooks/useRewards'
import { useTranslation } from 'react-i18next'

const LINKEDIN_SHARE_URL = 'https://www.linkedin.com/sharing/share-offsite/'
const KUBESTELLAR_URL = 'https://kubestellar.io'

export function LinkedInShareButton() {
  const { t: _t } = useTranslation()
  const [showConfirm, setShowConfirm] = useState(false)
  const { awardCoins, getActionCount } = useRewards()

  const shareCount = getActionCount('linkedin_share')

  const handleShare = () => {
    // Open LinkedIn share dialog
    const shareUrl = `${LINKEDIN_SHARE_URL}?url=${encodeURIComponent(KUBESTELLAR_URL)}`
    window.open(shareUrl, '_blank', 'width=600,height=600')

    // Show confirmation dialog
    setShowConfirm(true)
  }

  const handleConfirmShare = () => {
    // Award coins for sharing
    awardCoins('linkedin_share')
    setShowConfirm(false)
  }

  return (
    <>
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-600/20 hover:bg-blue-600/20 text-blue-400 text-sm transition-colors"
      >
        <Linkedin className="w-4 h-4" />
        Share on LinkedIn
        <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">+200</span>
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                Did you share on LinkedIn?
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Confirm that you shared KubeStellar to earn your coins!
              </p>

              <div className="flex items-center justify-center gap-2 mb-4 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-yellow-400 font-medium">+200 coins</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm transition-colors"
                >
                  Not yet
                </button>
                <button
                  onClick={handleConfirmShare}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                >
                  Yes, I shared!
                </button>
              </div>

              {shareCount > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  You&apos;ve shared {shareCount} time{shareCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Card version for displaying in rewards section
export function LinkedInShareCard() {
  const { getActionCount } = useRewards()
  const shareCount = getActionCount('linkedin_share')

  return (
    <div className="p-4 rounded-lg bg-blue-600/5 border border-blue-600/20">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
          <Linkedin className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-foreground">Share on LinkedIn</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Help spread the word about KubeStellar and earn coins!
          </p>
          <div className="flex items-center justify-between">
            <LinkedInShareButton />
            {shareCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Shared {shareCount}x
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
