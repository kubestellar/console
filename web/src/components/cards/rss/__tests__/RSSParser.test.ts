import { describe, it, expect } from 'vitest'
import { isValidThumbnail, normalizeRedditLink, parseRSSFeed } from '../RSSParser'

describe('isValidThumbnail', () => {
  it('returns false for empty string', () => {
    expect(isValidThumbnail('')).toBe(false)
  })

  it('returns false for non-http URL', () => {
    expect(isValidThumbnail('ftp://example.com/img.jpg')).toBe(false)
    expect(isValidThumbnail('/relative/path.jpg')).toBe(false)
  })

  it('returns true for valid image URL', () => {
    expect(isValidThumbnail('https://example.com/article-banner.jpg')).toBe(true)
  })

  it('rejects placeholder patterns', () => {
    expect(isValidThumbnail('https://example.com/placeholder.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/no_image.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/blank.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/1x1.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/spacer.gif')).toBe(false)
  })

  it('rejects social media icon patterns', () => {
    expect(isValidThumbnail('https://example.com/twitter_icon.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/facebook_icon.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/share_icon.svg')).toBe(false)
  })

  it('rejects logo patterns', () => {
    expect(isValidThumbnail('https://example.com/logo.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/logo.gif')).toBe(false)
  })

  it('rejects feedburner URLs', () => {
    expect(isValidThumbnail('https://feeds.feedburner.com/img.png')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isValidThumbnail('https://example.com/PLACEHOLDER.PNG')).toBe(false)
    expect(isValidThumbnail('https://example.com/NoImage.jpg')).toBe(false)
  })
})

describe('normalizeRedditLink', () => {
  it('replaces old.reddit.com with www.reddit.com', () => {
    expect(normalizeRedditLink('https://old.reddit.com/r/golang/comments/123'))
      .toBe('https://www.reddit.com/r/golang/comments/123')
  })

  it('leaves www.reddit.com unchanged', () => {
    const url = 'https://www.reddit.com/r/kubernetes'
    expect(normalizeRedditLink(url)).toBe(url)
  })

  it('leaves non-reddit URLs unchanged', () => {
    const url = 'https://example.com/page'
    expect(normalizeRedditLink(url)).toBe(url)
  })

  it('replaces multiple occurrences', () => {
    const url = 'https://old.reddit.com/r/sub?ref=old.reddit.com'
    expect(normalizeRedditLink(url)).toBe('https://www.reddit.com/r/sub?ref=www.reddit.com')
  })
})

describe('parseRSSFeed', () => {
  it('parses RSS 2.0 items', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Test Article</title>
          <link>https://example.com/article</link>
          <description>A test description</description>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <author>author@example.com</author>
        </item>
      </channel>
    </rss>`

    const items = parseRSSFeed(xml, 'https://example.com/feed')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Test Article')
    expect(items[0].link).toBe('https://example.com/article')
    expect(items[0].author).toBe('author@example.com')
    expect(items[0].pubDate).toBeInstanceOf(Date)
  })

  it('parses Atom feed entries', () => {
    const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Atom Entry</title>
        <link rel="alternate" href="https://example.com/entry"/>
        <summary>Atom summary</summary>
        <published>2024-01-01T00:00:00Z</published>
        <author><name>AtomAuthor</name></author>
      </entry>
    </feed>`

    const items = parseRSSFeed(xml, 'https://example.com/atom')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Atom Entry')
    expect(items[0].link).toBe('https://example.com/entry')
    expect(items[0].author).toBe('AtomAuthor')
  })

  it('returns empty array for empty feed', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`
    expect(parseRSSFeed(xml, 'https://example.com/feed')).toHaveLength(0)
  })

  it('handles missing optional fields gracefully', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Minimal Item</title>
        </item>
      </channel>
    </rss>`

    const items = parseRSSFeed(xml, 'https://example.com/feed')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Minimal Item')
    expect(items[0].link).toBe('')
    expect(items[0].description).toBe('')
    expect(items[0].pubDate).toBeUndefined()
  })

  it('truncates description to 300 chars', () => {
    const longDesc = 'A'.repeat(500)
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Long</title>
          <description>${longDesc}</description>
        </item>
      </channel>
    </rss>`

    const items = parseRSSFeed(xml, 'https://example.com/feed')
    expect(items[0].description!.length).toBeLessThanOrEqual(300)
  })

  it('extracts Reddit score and subreddit from reddit feed', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Reddit Post</title>
          <link>https://www.reddit.com/r/kubernetes/comments/abc123</link>
          <description>submitted by user - 42 points</description>
        </item>
      </channel>
    </rss>`

    const items = parseRSSFeed(xml, 'https://www.reddit.com/r/kubernetes.rss')
    expect(items[0].score).toBe(42)
    expect(items[0].subreddit).toBe('kubernetes')
  })

  it('uses link as item id, falls back to index', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <item><title>No Link</title></item>
      </channel>
    </rss>`

    const items = parseRSSFeed(xml, 'https://example.com/feed')
    expect(items[0].id).toBe('item-0')
  })
})
