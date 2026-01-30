import type { FeedItem } from './types'

// Filter out placeholder/generic images that aren't real article thumbnails
export function isValidThumbnail(url: string): boolean {
  if (!url || !url.startsWith('http')) return false
  const lowerUrl = url.toLowerCase()
  // Skip common placeholder/icon patterns
  const invalidPatterns = [
    'twitter_icon', 'facebook_icon', 'share_icon', 'social_icon',
    'default_thumb', 'placeholder', 'no_image', 'noimage',
    'blank.gif', 'spacer.gif', 'pixel.gif', '1x1',
    'icon_large', 'icon_small', 'logo.png', 'logo.gif',
    'feedburner', 'feeds.feedburner',
  ]
  return !invalidPatterns.some(pattern => lowerUrl.includes(pattern))
}

// Strip HTML tags from description
export function stripHTML(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

// Decode HTML entities
export function decodeHTMLEntities(text: string): string {
  const tmp = document.createElement('textarea')
  tmp.innerHTML = text
  return tmp.value
}

// Normalize Reddit URLs to use www.reddit.com instead of old.reddit.com
export function normalizeRedditLink(url: string): string {
  return url.replace(/old\.reddit\.com/g, 'www.reddit.com')
}

// Format relative time
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return date.toLocaleDateString()
}

// Parse RSS/Atom XML into feed items
export function parseRSSFeed(xml: string, feedUrl: string): FeedItem[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const items: FeedItem[] = []

  // Check for RSS 2.0 format
  const rssItems = doc.querySelectorAll('item')
  if (rssItems.length > 0) {
    rssItems.forEach((item, idx) => {
      const title = item.querySelector('title')?.textContent || 'Untitled'
      const link = item.querySelector('link')?.textContent || ''
      const description = item.querySelector('description')?.textContent || ''
      const pubDate = item.querySelector('pubDate')?.textContent
      const author = item.querySelector('author, dc\\:creator')?.textContent || ''
      const comments = item.querySelector('comments')?.textContent || ''

      // Extract thumbnail from multiple sources, validating each
      let thumbnail = ''
      const isRedditItem = feedUrl.includes('reddit.com')

      // 1. media:thumbnail (try multiple selector variants for namespace issues)
      const mediaThumbnail = item.querySelector('media\\:thumbnail, thumbnail')?.getAttribute('url') || ''
      if (isValidThumbnail(mediaThumbnail)) thumbnail = mediaThumbnail

      // 1b. Try getting media:thumbnail via getElementsByTagName (works better with namespaces)
      if (!thumbnail) {
        const thumbElements = item.getElementsByTagName('media:thumbnail')
        if (thumbElements.length > 0) {
          const thumbUrl = thumbElements[0].getAttribute('url') || ''
          if (isValidThumbnail(thumbUrl)) thumbnail = thumbUrl
        }
      }

      // 2. media:content with image type
      if (!thumbnail) {
        const mediaContent = item.querySelector('media\\:content[medium="image"], media\\:content[type^="image"]')
        const mediaUrl = mediaContent?.getAttribute('url') || ''
        if (isValidThumbnail(mediaUrl)) thumbnail = mediaUrl
      }
      // 3. enclosure with image type
      if (!thumbnail) {
        const enclosure = item.querySelector('enclosure[type^="image"]')
        const encUrl = enclosure?.getAttribute('url') || ''
        if (isValidThumbnail(encUrl)) thumbnail = encUrl
      }
      // 4. Any enclosure (might be image)
      if (!thumbnail) {
        const enclosure = item.querySelector('enclosure')
        const encUrl = enclosure?.getAttribute('url') || ''
        if (encUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) && isValidThumbnail(encUrl)) {
          thumbnail = encUrl
        }
      }
      // 5. Extract image from description/content HTML (Reddit embeds images in tables)
      if (!thumbnail && description) {
        // Try to find images - Reddit often uses preview.redd.it or i.redd.it
        const imgMatches = description.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
        for (const match of imgMatches) {
          const imgUrl = match[1]
          // Prefer Reddit's own image hosts
          if (isRedditItem && (imgUrl.includes('redd.it') || imgUrl.includes('redditmedia.com'))) {
            if (isValidThumbnail(imgUrl)) {
              thumbnail = imgUrl
              break
            }
          } else if (!thumbnail && isValidThumbnail(imgUrl)) {
            thumbnail = imgUrl
          }
        }
      }
      // 6. Look for image in content:encoded
      if (!thumbnail) {
        const contentEncoded = item.querySelector('content\\:encoded, encoded')?.textContent || ''
        const imgMatch = contentEncoded.match(/<img[^>]+src=["']([^"']+)["']/)
        if (imgMatch && isValidThumbnail(imgMatch[1])) thumbnail = imgMatch[1]
      }

      // Reddit-specific fields
      const isReddit = feedUrl.includes('reddit.com')
      let score: number | undefined
      let subreddit: string | undefined

      if (isReddit) {
        // Reddit includes score in various ways
        const scoreMatch = description.match(/(\d+)\s*points?/i)
        if (scoreMatch) score = parseInt(scoreMatch[1], 10)

        // Extract subreddit from link
        const subredditMatch = link.match(/reddit\.com\/r\/([^/]+)/)
        if (subredditMatch) subreddit = subredditMatch[1]
      }

      items.push({
        id: link || `item-${idx}`,
        title: decodeHTMLEntities(title),
        link,
        description: stripHTML(description).slice(0, 300),
        pubDate: pubDate ? new Date(pubDate) : undefined,
        author,
        thumbnail,
        comments,
        score,
        subreddit,
      })
    })
    return items
  }

  // Check for Atom format
  const atomEntries = doc.querySelectorAll('entry')
  if (atomEntries.length > 0) {
    atomEntries.forEach((entry, idx) => {
      const title = entry.querySelector('title')?.textContent || 'Untitled'
      const linkEl = entry.querySelector('link[rel="alternate"], link')
      const link = linkEl?.getAttribute('href') || ''
      const summary = entry.querySelector('summary, content')?.textContent || ''
      const published = entry.querySelector('published, updated')?.textContent
      const author = entry.querySelector('author name')?.textContent || ''

      // Extract thumbnail for Atom feeds, validating each
      let thumbnail = ''
      // 1. media:thumbnail
      const mediaThumbnail = entry.querySelector('media\\:thumbnail, thumbnail')?.getAttribute('url') || ''
      if (isValidThumbnail(mediaThumbnail)) thumbnail = mediaThumbnail
      // 2. media:content
      if (!thumbnail) {
        const mediaContent = entry.querySelector('media\\:content[medium="image"], media\\:content[type^="image"]')
        const mediaUrl = mediaContent?.getAttribute('url') || ''
        if (isValidThumbnail(mediaUrl)) thumbnail = mediaUrl
      }
      // 3. Extract from content HTML
      if (!thumbnail && summary) {
        const imgMatch = summary.match(/<img[^>]+src=["']([^"']+)["']/)
        if (imgMatch && isValidThumbnail(imgMatch[1])) thumbnail = imgMatch[1]
      }

      items.push({
        id: link || `entry-${idx}`,
        title: decodeHTMLEntities(title),
        link,
        description: stripHTML(summary).slice(0, 300),
        pubDate: published ? new Date(published) : undefined,
        author,
        thumbnail,
      })
    })
  }

  return items
}
