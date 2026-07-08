import { describe, it, expect } from 'vitest'
import { isValidThumbnail, normalizeRedditLink, parseRSSFeed } from '../RSSParser'

// ---------------------------------------------------------------------------
// isValidThumbnail
// ---------------------------------------------------------------------------

describe('isValidThumbnail', () => {
  it('returns false for empty string', () => {
    expect(isValidThumbnail('')).toBe(false)
  })

  it('returns false for non-http URL', () => {
    expect(isValidThumbnail('ftp://example.com/image.jpg')).toBe(false)
    expect(isValidThumbnail('data:image/png;base64,abc')).toBe(false)
  })

  it('returns false for known placeholder patterns', () => {
    expect(isValidThumbnail('https://example.com/twitter_icon.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/placeholder.jpg')).toBe(false)
    expect(isValidThumbnail('https://cdn.example.com/logo.png')).toBe(false)
    expect(isValidThumbnail('https://example.com/logo.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/blank.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/spacer.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/1x1.gif')).toBe(false)
    expect(isValidThumbnail('https://example.com/noimage.jpg')).toBe(false)
    expect(isValidThumbnail('https://example.com/no_image.png')).toBe(false)
    expect(isValidThumbnail('https://feeds.feedburner.com/img.gif')).toBe(false)
  })

  it('returns true for a regular article thumbnail URL', () => {
    expect(isValidThumbnail('https://example.com/article-thumbnail.jpg')).toBe(true)
    expect(isValidThumbnail('https://i.redd.it/some-image.jpg')).toBe(true)
    expect(isValidThumbnail('https://cdn.example.com/news/photo.webp')).toBe(true)
  })

  it('is case-insensitive for placeholder pattern matching', () => {
    expect(isValidThumbnail('https://example.com/PLACEHOLDER.jpg')).toBe(false)
    expect(isValidThumbnail('https://example.com/Twitter_Icon.PNG')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizeRedditLink
// ---------------------------------------------------------------------------

describe('normalizeRedditLink', () => {
  it('replaces old.reddit.com with www.reddit.com', () => {
    expect(normalizeRedditLink('https://old.reddit.com/r/test')).toBe('https://www.reddit.com/r/test')
  })

  it('replaces all occurrences of old.reddit.com', () => {
    const input = 'https://old.reddit.com/r/a and https://old.reddit.com/r/b'
    const output = normalizeRedditLink(input)
    expect(output).not.toContain('old.reddit.com')
    expect(output).toContain('www.reddit.com')
  })

  it('is a no-op for non-old.reddit.com URLs', () => {
    const url = 'https://www.reddit.com/r/test'
    expect(normalizeRedditLink(url)).toBe(url)
  })

  it('is a no-op for completely unrelated URLs', () => {
    const url = 'https://example.com/news'
    expect(normalizeRedditLink(url)).toBe(url)
  })
})

// ---------------------------------------------------------------------------
// parseRSSFeed — RSS 2.0
// ---------------------------------------------------------------------------

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Article One</title>
      <link>https://example.com/article-one</link>
      <description>First article content here</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <author>Jane Doe</author>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://example.com/article-two</link>
      <description><![CDATA[<p>Second article</p>]]></description>
    </item>
  </channel>
</rss>`

describe('parseRSSFeed – RSS 2.0', () => {
  it('returns an array of FeedItems', () => {
    const items = parseRSSFeed(RSS_XML, 'https://example.com/feed.rss')
    expect(Array.isArray(items)).toBe(true)
    expect(items).toHaveLength(2)
  })

  it('parses title and link', () => {
    const [first] = parseRSSFeed(RSS_XML, 'https://example.com/feed.rss')
    expect(first.title).toBe('Article One')
    expect(first.link).toBe('https://example.com/article-one')
  })

  it('parses pubDate as a Date object', () => {
    const [first] = parseRSSFeed(RSS_XML, 'https://example.com/feed.rss')
    expect(first.pubDate).toBeInstanceOf(Date)
  })

  it('uses link as item id', () => {
    const [first] = parseRSSFeed(RSS_XML, 'https://example.com/feed.rss')
    expect(first.id).toBe('https://example.com/article-one')
  })

  it('strips HTML from description', () => {
    const [, second] = parseRSSFeed(RSS_XML, 'https://example.com/feed.rss')
    expect(second.description).not.toContain('<p>')
    expect(second.description).toBe('Second article')
  })

  it('truncates description to 300 characters', () => {
    const longDesc = 'x'.repeat(400)
    const xml = `<rss version="2.0"><channel><item>
      <title>T</title><link>https://example.com</link>
      <description>${longDesc}</description>
    </item></channel></rss>`
    const [item] = parseRSSFeed(xml, 'https://example.com/feed.rss')
    expect(item.description.length).toBeLessThanOrEqual(300)
  })

  it('returns empty array for empty RSS', () => {
    const xml = `<rss version="2.0"><channel></channel></rss>`
    const items = parseRSSFeed(xml, 'https://example.com/feed.rss')
    expect(items).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// parseRSSFeed — Atom
// ---------------------------------------------------------------------------

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/entry-one" rel="alternate"/>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>John Smith</name></author>
    <summary>Atom entry summary</summary>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/entry-two"/>
    <summary>Second atom entry</summary>
  </entry>
</feed>`

describe('parseRSSFeed – Atom', () => {
  it('parses Atom entries when no RSS items are found', () => {
    const items = parseRSSFeed(ATOM_XML, 'https://example.com/atom.xml')
    expect(items).toHaveLength(2)
  })

  it('parses title and href from Atom link element', () => {
    const [first] = parseRSSFeed(ATOM_XML, 'https://example.com/atom.xml')
    expect(first.title).toBe('Atom Entry One')
    expect(first.link).toBe('https://example.com/entry-one')
  })

  it('parses published date', () => {
    const [first] = parseRSSFeed(ATOM_XML, 'https://example.com/atom.xml')
    expect(first.pubDate).toBeInstanceOf(Date)
  })

  it('parses author from Atom author/name', () => {
    const [first] = parseRSSFeed(ATOM_XML, 'https://example.com/atom.xml')
    expect(first.author).toBe('John Smith')
  })

  it('returns empty array for empty Atom feed', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"></feed>`
    const items = parseRSSFeed(xml, 'https://example.com/atom.xml')
    expect(items).toHaveLength(0)
  })
})
