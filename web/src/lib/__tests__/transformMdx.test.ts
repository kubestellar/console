import { describe, it, expect } from 'vitest'
import { sanitizeHtmlForMdx, stripUntilStable } from '../transformMdx'

describe('sanitizeHtmlForMdx', () => {
  describe('safe content passes through unchanged', () => {
    it('passes plain text through', () => {
      expect(sanitizeHtmlForMdx('Hello world')).toBe('Hello world')
    })

    it('passes safe paragraph through', () => {
      expect(sanitizeHtmlForMdx('<p>Hello world</p>')).toBe('<p>Hello world</p>')
    })

    it('passes allowed heading tags through', () => {
      expect(sanitizeHtmlForMdx('<h1>Title</h1>')).toBe('<h1>Title</h1>')
      expect(sanitizeHtmlForMdx('<h2>Sub</h2>')).toBe('<h2>Sub</h2>')
    })

    it('passes allowed inline tags through', () => {
      expect(sanitizeHtmlForMdx('<strong>bold</strong>')).toBe('<strong>bold</strong>')
      expect(sanitizeHtmlForMdx('<em>italic</em>')).toBe('<em>italic</em>')
      expect(sanitizeHtmlForMdx('<code>snippet</code>')).toBe('<code>snippet</code>')
    })

    it('passes safe anchor with https href through', () => {
      expect(sanitizeHtmlForMdx('<a href="https://example.com">Example</a>')).toBe(
        '<a href="https://example.com">Example</a>'
      )
    })

    it('passes mailto href through', () => {
      expect(sanitizeHtmlForMdx('<a href="mailto:user@example.com">email</a>')).toBe(
        '<a href="mailto:user@example.com">email</a>'
      )
    })

    it('passes nested safe tags through', () => {
      const input = '<div><p><strong>bold <em>italic</em></strong></p></div>'
      expect(sanitizeHtmlForMdx(input)).toBe(input)
    })

    it('passes img with alt and src through', () => {
      const result = sanitizeHtmlForMdx('<img src="logo.png" alt="Logo">')
      expect(result).toContain('src="logo.png"')
      expect(result).toContain('alt="Logo"')
    })
  })

  describe('empty and trivial inputs', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeHtmlForMdx('')).toBe('')
    })

    it('returns empty string for null-like coercion via typeof guard', () => {
      // @ts-expect-error testing runtime guard
      expect(sanitizeHtmlForMdx(null)).toBe('')
    })

    it('returns empty string for undefined via typeof guard', () => {
      // @ts-expect-error testing runtime guard
      expect(sanitizeHtmlForMdx(undefined)).toBe('')
    })

    it('returns empty string for non-string number', () => {
      // @ts-expect-error testing runtime guard
      expect(sanitizeHtmlForMdx(42)).toBe('')
    })
  })

  describe('script tag injection', () => {
    it('strips bare script tag', () => {
      const result = sanitizeHtmlForMdx('<script>alert(1)</script>')
      expect(result).toBe('')
    })

    it('strips script tag embedded in safe content', () => {
      const result = sanitizeHtmlForMdx('<p>text</p><script>evil()</script>')
      expect(result).toBe('<p>text</p>')
    })

    it('strips nested script inside allowed tag', () => {
      const result = sanitizeHtmlForMdx('<div><script>alert(1)</script></div>')
      expect(result).toBe('<div></div>')
    })

    it('does not contain script or alert after stripping', () => {
      const result = sanitizeHtmlForMdx('<script>alert("xss")</script><p>safe</p>')
      expect(result).not.toContain('<script')
      expect(result).not.toContain('alert')
    })

    it('strips script with type attribute', () => {
      const result = sanitizeHtmlForMdx('<script type="text/javascript">evil()</script>')
      expect(result).toBe('')
    })

    it('strips noscript tag', () => {
      const result = sanitizeHtmlForMdx('<noscript><img src="x" onerror="alert(1)"></noscript>')
      expect(result).not.toContain('noscript')
    })
  })

  describe('event handler injection', () => {
    it('strips onerror from img tag', () => {
      const result = sanitizeHtmlForMdx('<img onerror="alert(1)" src="x">')
      expect(result).not.toContain('onerror')
      expect(result).toContain('src="x"')
    })

    it('strips onclick from div', () => {
      const result = sanitizeHtmlForMdx('<div onclick="evil()">text</div>')
      expect(result).not.toContain('onclick')
      expect(result).toContain('text')
    })

    it('strips onload from body-like tag', () => {
      const result = sanitizeHtmlForMdx('<div onload="payload()">text</div>')
      expect(result).not.toContain('onload')
    })

    it('strips onmouseover from span', () => {
      const result = sanitizeHtmlForMdx('<span onmouseover="steal()">hover me</span>')
      expect(result).not.toContain('onmouseover')
      expect(result).toContain('hover me')
    })

    it('strips onfocus from input-like element', () => {
      const result = sanitizeHtmlForMdx('<p onfocus="capture()">paragraph</p>')
      expect(result).not.toContain('onfocus')
    })

    it('strips all on* handlers from any allowed tag', () => {
      const handlers = ['onclick', 'onmouseover', 'onerror', 'onload', 'onfocus', 'onblur', 'onkeydown']
      for (const handler of handlers) {
        const result = sanitizeHtmlForMdx(`<p ${handler}="evil()">text</p>`)
        expect(result).not.toContain(handler)
      }
    })
  })

  describe('javascript: URL injection', () => {
    it('strips javascript: href from anchor tag', () => {
      const result = sanitizeHtmlForMdx('<a href="javascript:alert(1)">click</a>')
      expect(result).not.toContain('javascript:')
      expect(result).toContain('click')
    })

    it('strips javascript: with whitespace obfuscation', () => {
      const result = sanitizeHtmlForMdx('<a href="  javascript:alert(1)">click</a>')
      expect(result).not.toContain('javascript:')
    })

    it('strips javascript: in uppercase', () => {
      const result = sanitizeHtmlForMdx('<a href="JAVASCRIPT:alert(1)">click</a>')
      expect(result).not.toContain('JAVASCRIPT:')
      expect(result).not.toContain('javascript:')
    })

    it('strips javascript: with tab character', () => {
      const result = sanitizeHtmlForMdx('<a href="java\tscript:alert(1)">click</a>')
      expect(result).not.toContain('javascript:')
    })
  })

  describe('data: URL injection', () => {
    it('strips data: href from anchor tag', () => {
      const result = sanitizeHtmlForMdx('<a href="data:text/html,<script>alert(1)</script>">click</a>')
      expect(result).not.toContain('data:')
      expect(result).toContain('click')
    })

    it('strips data:text/html src from img tag', () => {
      // data:text/html is an XSS vector; data:image/* is allowed as inline image
      const result = sanitizeHtmlForMdx('<img src="data:text/html,<script>alert(1)</script>" alt="x">')
      expect(result).not.toContain('data:text/html')
    })
  })

  describe('dangerous tags stripped', () => {
    it('strips iframe', () => {
      const result = sanitizeHtmlForMdx('<iframe src="https://evil.com"></iframe>')
      expect(result).not.toContain('iframe')
    })

    it('strips object tag', () => {
      const result = sanitizeHtmlForMdx('<object data="evil.swf"></object>')
      expect(result).not.toContain('object')
    })

    it('strips embed tag', () => {
      const result = sanitizeHtmlForMdx('<embed src="evil.swf">')
      expect(result).not.toContain('embed')
    })

    it('strips style tag', () => {
      const result = sanitizeHtmlForMdx('<style>body{background:url(javascript:alert(1))}</style>')
      expect(result).not.toContain('<style')
    })

    it('strips meta tag', () => {
      const result = sanitizeHtmlForMdx('<meta http-equiv="refresh" content="0;url=javascript:alert(1)">')
      expect(result).not.toContain('meta')
    })

    it('strips base tag', () => {
      const result = sanitizeHtmlForMdx('<base href="https://evil.com/">')
      expect(result).not.toContain('base')
    })

    it('strips form tag', () => {
      const result = sanitizeHtmlForMdx('<form action="https://evil.com/steal"><input name="token"></form>')
      expect(result).not.toContain('form')
      expect(result).not.toContain('input')
    })
  })

  describe('style attribute injection', () => {
    it('strips style attribute from paragraph', () => {
      const result = sanitizeHtmlForMdx('<p style="background:url(javascript:alert(1))">text</p>')
      expect(result).not.toContain('style')
      expect(result).toContain('text')
    })

    it('strips style from any allowed tag', () => {
      const result = sanitizeHtmlForMdx('<div style="color:red">text</div>')
      expect(result).not.toContain('style')
    })
  })

  describe('data- attribute injection', () => {
    it('strips data- attributes', () => {
      const result = sanitizeHtmlForMdx('<div data-payload="<script>evil()</script>">text</div>')
      expect(result).not.toContain('data-')
      expect(result).toContain('text')
    })
  })

  describe('HTML entities', () => {
    it('preserves HTML-encoded entities as-is (they are safe text)', () => {
      const result = sanitizeHtmlForMdx('&lt;script&gt;alert(1)&lt;/script&gt;')
      // HTML entities are safe text content — no stripping needed
      expect(result).toContain('&lt;script&gt;')
    })
  })

  describe('unicode and obfuscation tricks', () => {
    it('strips unicode-literal script tags', () => {
      // \u003c = <, \u003e = >
      const result = sanitizeHtmlForMdx('\u003cscript\u003ealert(1)\u003c/script\u003e')
      expect(result).toBe('')
    })
  })

  describe('malformed and nested input', () => {
    it('handles deeply nested allowed tags', () => {
      const input = '<ul><li><strong><em>deep</em></strong></li></ul>'
      expect(sanitizeHtmlForMdx(input)).toBe(input)
    })

    it('handles malformed/unclosed tags gracefully', () => {
      const result = sanitizeHtmlForMdx('<p>unclosed paragraph')
      expect(result).toContain('unclosed paragraph')
      expect(result).not.toContain('<script')
    })

    it('handles empty tags', () => {
      expect(sanitizeHtmlForMdx('<p></p>')).toBe('<p></p>')
      expect(sanitizeHtmlForMdx('<br>')).toBe('<br>')
    })

    it('returns a string for any input', () => {
      const inputs = [
        '<<<<>>>>>',
        '><><><',
        '&&&',
        String.fromCharCode(0),
        '\n\n\n',
        '   ',
      ]
      for (const input of inputs) {
        const result = sanitizeHtmlForMdx(input)
        expect(typeof result).toBe('string')
      }
    })
  })

  describe('SVG injection', () => {
    it('strips SVG with event handler', () => {
      const result = sanitizeHtmlForMdx('<svg onload="alert(1)">x</svg>')
      expect(result).not.toContain('onload')
      expect(result).not.toContain('<svg')
    })
  })
})

describe('stripUntilStable', () => {
  it('returns empty string for empty input', () => {
    expect(stripUntilStable('')).toBe('')
  })

  it('returns empty string for null input (runtime guard)', () => {
    // @ts-expect-error testing runtime guard
    expect(stripUntilStable(null)).toBe('')
  })

  it('returns empty string for undefined input (runtime guard)', () => {
    // @ts-expect-error testing runtime guard
    expect(stripUntilStable(undefined)).toBe('')
  })

  it('passes safe content through unchanged', () => {
    const safe = '<p>Hello <strong>world</strong></p>'
    expect(stripUntilStable(safe)).toBe(safe)
  })

  it('strips script tag (single pass is sufficient)', () => {
    const result = stripUntilStable('<script>alert(1)</script>')
    expect(result).toBe('')
    expect(result).not.toContain('script')
  })

  it('strips event handlers', () => {
    const result = stripUntilStable('<p onclick="evil()">text</p>')
    expect(result).not.toContain('onclick')
    expect(result).toContain('text')
  })

  it('strips javascript: URLs', () => {
    const result = stripUntilStable('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain('javascript:')
  })

  it('produces idempotent output — second pass equals first pass', () => {
    const inputs = [
      '<p>safe text</p>',
      '<script>alert(1)</script>',
      '<p onclick="x">text</p>',
      '<img onerror="evil()" src="x">',
      '<a href="javascript:alert(1)">link</a>',
    ]
    for (const input of inputs) {
      const once = stripUntilStable(input)
      const twice = stripUntilStable(once)
      expect(once).toBe(twice)
    }
  })

  it('respects default max iterations (5) without infinite loop', () => {
    // Passing clean content should converge immediately
    const result = stripUntilStable('<p>Hello</p>')
    expect(result).toBe('<p>Hello</p>')
  })

  it('respects custom maxIterations of 1', () => {
    // With maxIterations=1, it applies sanitizeHtmlForMdx once and returns
    const result = stripUntilStable('<script>alert(1)</script>', 1)
    expect(result).not.toContain('<script')
  })

  it('respects maxIterations of 0 — returns input unchanged', () => {
    // 0 iterations means never sanitize — the loop body never runs
    const dangerous = '<script>alert(1)</script>'
    const result = stripUntilStable(dangerous, 0)
    expect(result).toBe(dangerous)
  })

  it('strips content mixed with safe and dangerous nodes', () => {
    const input = '<p>safe</p><script>evil()</script><div>also safe</div>'
    const result = stripUntilStable(input)
    expect(result).toContain('<p>safe</p>')
    expect(result).toContain('also safe')
    expect(result).not.toContain('<script')
  })

  it('handles deeply nested content', () => {
    const input = '<div><p><em><strong>text</strong></em></p></div>'
    expect(stripUntilStable(input)).toBe(input)
  })

  it('strips iframe tags', () => {
    const result = stripUntilStable('<iframe src="evil.com"></iframe>')
    expect(result).not.toContain('iframe')
  })

  it('strips style attributes', () => {
    const result = stripUntilStable('<p style="xss:expression(alert(1))">text</p>')
    expect(result).not.toContain('style')
    expect(result).toContain('text')
  })

  it('returns a string for any string input', () => {
    const inputs = ['', '   ', '<<<<', '&&&&', '\u0000', '\u003cscript\u003e']
    for (const input of inputs) {
      expect(typeof stripUntilStable(input)).toBe('string')
    }
  })
})
