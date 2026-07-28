import type { FeedItem, RSSItemRaw } from './types'
import { CORS_PROXIES } from './constants'
import { parseRSSFeed, stripHTML, decodeHTMLEntities, isValidThumbnail } from './RSSParser'

const MIN_VALID_FEED_LENGTH = 50

export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchSingleFeed(feedUrl: string): Promise<FeedItem[]> {
  const FETCH_TIMEOUT_MS = 10000

  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy.url + encodeURIComponent(feedUrl)
      const response = await fetchWithTimeout(proxyUrl, FETCH_TIMEOUT_MS)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      let items: FeedItem[] = []

      if (proxy.type === 'json-rss2json') {
        const data = await response.json()
        if (data.status === 'ok' && data.items) {
          items = data.items.map((item: RSSItemRaw, idx: number) => {
            let thumb = item.thumbnail || item.enclosure?.thumbnail || item.enclosure?.link || ''
            if (!isValidThumbnail(thumb)) thumb = ''
            if (!thumb && (item.description || item.content)) {
              const descOrContent = item.description || item.content
              if (descOrContent) {
                const imgMatch = descOrContent.match(/<img[^>]+src=["']([^"']+)["']/)
                if (imgMatch && isValidThumbnail(imgMatch[1])) {
                  thumb = imgMatch[1]
                }
              }
            }
            return {
              id: `${feedUrl}-${item.guid || item.link || idx}`,
              title: decodeHTMLEntities(item.title || 'Untitled'),
              link: item.link || '',
              description: stripHTML(item.description || item.content || '').slice(0, 300),
              pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
              author: item.author || '',
              thumbnail: thumb,
              subreddit: item.link?.match(/reddit\.com\/r\/([^/]+)/)?.[1] }
          })
        } else {
          throw new Error(data.message || 'Invalid RSS feed')
        }
      } else if (proxy.type === 'json-contents') {
        const data = await response.json()
        if (data.contents) {
          let contents = data.contents
          if (contents.startsWith('data:') && contents.includes('base64,')) {
            const base64Part = contents.split('base64,')[1]
            contents = atob(base64Part)
          }
          if (contents.includes('<title>500') || contents.includes('Internal Server Error')) {
            throw new Error('Proxy returned error page')
          }
          items = parseRSSFeed(contents, feedUrl)
        } else {
          throw new Error('No content in response')
        }
      } else {
        const feedXml = await response.text()
        if (!feedXml || feedXml.length < MIN_VALID_FEED_LENGTH) {
          throw new Error('Empty response')
        }
        if (feedXml.includes('Internal Server Error') || feedXml.includes('<!DOCTYPE html>') && !feedXml.includes('<rss') && !feedXml.includes('<feed')) {
          throw new Error('Received error page instead of feed')
        }
        items = parseRSSFeed(feedXml, feedUrl)
      }

      if (items.length > 0) {
        return items
      }
      throw new Error('No items parsed from feed')
    } catch {
      continue
    }
  }
  return []
}
