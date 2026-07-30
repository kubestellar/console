import { useState, useMemo } from 'react'
import { Star, ShieldCheck, MessageSquare, ThumbsUp, User } from 'lucide-react'
import type { CommunityReview as CommunityReviewType, ReviewRating, ReviewSummary } from '../../hooks/useMarketplace/types'
import { emitMarketplaceReviewSubmitted, emitMarketplaceReviewHelpful } from '../../lib/analytics-events/marketplace'

const MAX_REVIEW_TEXT_LENGTH = 500
const MAX_VISIBLE_REVIEWS = 5
const STAR_RATINGS: readonly ReviewRating[] = [1, 2, 3, 4, 5] as const
const EMPTY_RATING_DISTRIBUTION: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
const RATING_BAR_MIN_WIDTH_PCT = 2

interface CommunityReviewPanelProps {
  itemId: string
  itemName: string
  reviews: CommunityReviewType[]
  summary: ReviewSummary | null
  isInstalled: boolean
  onSubmitReview?: (rating: ReviewRating, text: string) => Promise<void>
}

function StarDisplay({ rating, maxStars = 5, size = 'sm' }: {
  rating: number
  maxStars?: number
  size?: 'sm' | 'md'
}) {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of ${maxStars} stars`}>
      {Array.from({ length: maxStars }, (_, i) => (
        <Star
          key={i}
          className={`${iconSize} ${
            i < Math.round(rating)
              ? 'text-yellow-400 fill-yellow-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  )
}

function RatingDistributionBar({ rating, count, total }: {
  rating: ReviewRating
  count: number
  total: number
}) {
  const pct = total > 0 ? Math.max((count / total) * 100, RATING_BAR_MIN_WIDTH_PCT) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-muted-foreground text-right">{rating}</span>
      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-yellow-400 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-muted-foreground text-right">{count}</span>
    </div>
  )
}

function ReviewCard({ review }: { review: CommunityReviewType }) {
  const [helpful, setHelpful] = useState(false)

  const handleHelpful = () => {
    if (helpful) return
    setHelpful(true)
    emitMarketplaceReviewHelpful(review.itemId, review.id)
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">{review.authorGithub}</span>
          {review.verifiedInstall && (
            <span
              className="flex items-center gap-1 text-2xs text-green-400 bg-green-950 px-1.5 py-0.5 rounded"
              title="This reviewer has installed the item"
            >
              <ShieldCheck className="w-3 h-3" aria-hidden="true" />
              Verified Install
            </span>
          )}
        </div>
        <StarDisplay rating={review.rating} />
      </div>
      {review.text && (
        <p className="text-sm text-muted-foreground leading-relaxed">{review.text}</p>
      )}
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span>{new Date(review.createdAt).toLocaleDateString()}</span>
        <button
          onClick={handleHelpful}
          disabled={helpful}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            helpful
              ? 'text-primary bg-primary/10'
              : 'hover:text-foreground hover:bg-muted'
          }`}
          aria-label={helpful ? 'Marked as helpful' : 'Mark as helpful'}
        >
          <ThumbsUp className="w-3 h-3" />
          {helpful ? 'Helpful' : 'Helpful?'}
        </button>
      </div>
    </div>
  )
}

export function CommunityReviewPanel({
  itemId,
  itemName,
  reviews,
  summary,
  isInstalled,
  onSubmitReview,
}: CommunityReviewPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState<ReviewRating | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const safeReviews = useMemo(() => reviews || [], [reviews])
  const distribution = summary?.ratingDistribution ?? EMPTY_RATING_DISTRIBUTION

  const visibleReviews = showAll ? safeReviews : safeReviews.slice(0, MAX_VISIBLE_REVIEWS)

  const handleSubmit = async () => {
    if (!rating || !onSubmitReview) return
    setSubmitting(true)
    try {
      await onSubmitReview(rating, text.trim())
      emitMarketplaceReviewSubmitted(itemId, itemName, rating)
      setShowForm(false)
      setRating(null)
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4" role="region" aria-label={`Community reviews for ${itemName}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium text-foreground">Community Reviews</h4>
          {summary && (
            <span className="text-xs text-muted-foreground">
              ({summary.totalReviews})
            </span>
          )}
        </div>
        {isInstalled && onSubmitReview && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
            aria-label="Write a review"
          >
            Write a Review
          </button>
        )}
      </div>

      {summary && summary.totalReviews > 0 && (
        <div className="flex items-start gap-4 bg-muted/30 rounded-lg p-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {summary.averageRating.toFixed(1)}
            </div>
            <StarDisplay rating={summary.averageRating} size="md" />
          </div>
          <div className="flex-1 space-y-1">
            {(STAR_RATINGS.slice().reverse() as ReviewRating[]).map(r => (
              <RatingDistributionBar
                key={r}
                rating={r}
                count={distribution[r] ?? 0}
                total={summary.totalReviews}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="border border-primary/30 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Your rating:</span>
            <div className="flex gap-0.5">
              {STAR_RATINGS.map(r => (
                <button
                  key={r}
                  onClick={() => setRating(r)}
                  className="p-0.5 hover:scale-110 transition-transform"
                  aria-label={`Rate ${r} star${r > 1 ? 's' : ''}`}
                >
                  <Star className={`w-5 h-5 ${
                    rating && r <= rating
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-muted-foreground/30'
                  }`} />
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_REVIEW_TEXT_LENGTH))}
            placeholder="Share your experience with this item..."
            className="w-full h-20 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            maxLength={MAX_REVIEW_TEXT_LENGTH}
            aria-label="Review text"
          />
          <div className="flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">
              {text.length}/{MAX_REVIEW_TEXT_LENGTH}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setRating(null); setText('') }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!rating || submitting}
                className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {safeReviews.length > 0 ? (
        <div className="space-y-2">
          {visibleReviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
          {safeReviews.length > MAX_VISIBLE_REVIEWS && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Show all {safeReviews.length} reviews
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No reviews yet. {isInstalled ? 'Be the first to review!' : 'Install to leave a review.'}
        </p>
      )}
    </div>
  )
}
