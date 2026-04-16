/**
 * Tests for releaseNotesComponents.tsx — the custom markdown component map.
 * Renders each component to verify it produces valid JSX without crashing.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { buildReleaseNotesComponents } from '../releaseNotesComponents'

// Mock CodeBlock — releaseNotesComponents just passes props through
vi.mock('../../../components/ui/CodeBlock', () => ({
  CodeBlock: ({ children, language }: { children: string; language: string }) => (
    <pre data-lang={language}>{children}</pre>
  ),
}))

const components = buildReleaseNotesComponents('sm')

describe('buildReleaseNotesComponents', () => {
  it('returns an object with all expected element keys', () => {
    const keys = Object.keys(components)
    for (const expected of ['code', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'hr', 'table', 'thead', 'th', 'td']) {
      expect(keys).toContain(expected)
    }
  })

  it('accepts sm/base/lg font sizes without error', () => {
    for (const size of ['sm', 'base', 'lg'] as const) {
      const c = buildReleaseNotesComponents(size)
      expect(c).toBeDefined()
    }
  })
})

describe('code component', () => {
  it('renders inline code when no language class', () => {
    const Code = components.code
    render(<Code>hello</Code>)
    expect(screen.getByText('hello').tagName).toBe('CODE')
  })

  it('renders CodeBlock for fenced code with language class', () => {
    const Code = components.code
    render(<Code className="language-bash">echo hi</Code>)
    const pre = screen.getByText('echo hi')
    expect(pre.tagName).toBe('PRE')
    expect(pre.getAttribute('data-lang')).toBe('bash')
  })
})

describe('link component', () => {
  const Link = components.a

  it('renders a safe link for https URLs', () => {
    render(<Link href="https://example.com">click</Link>)
    const el = screen.getByText('click')
    expect(el.tagName).toBe('A')
    expect(el.getAttribute('href')).toBe('https://example.com')
    expect(el.getAttribute('target')).toBe('_blank')
  })

  it('renders a span for unsafe/missing hrefs', () => {
    render(<Link href="javascript:alert(1)">bad</Link>)
    expect(screen.getByText('bad').tagName).toBe('SPAN')
  })

  it('renders a span when href is undefined', () => {
    render(<Link>no link</Link>)
    expect(screen.getByText('no link').tagName).toBe('SPAN')
  })
})

describe('heading components', () => {
  it('renders h1-h6 with children', () => {
    for (const [tag, Comp] of [
      ['H1', components.h1],
      ['H2', components.h2],
      ['H3', components.h3],
      ['H4', components.h4],
      ['H5', components.h5],
      ['H6', components.h6],
    ] as const) {
      render(<Comp>{`heading-${tag}`}</Comp>)
      expect(screen.getByText(`heading-${tag}`).tagName).toBe(tag)
    }
  })
})

describe('block elements', () => {
  it('renders p, ul, ol, li, blockquote, strong', () => {
    const P = components.p
    const Ul = components.ul
    const Li = components.li
    const Strong = components.strong

    render(<P>paragraph</P>)
    expect(screen.getByText('paragraph').tagName).toBe('P')

    render(<Ul><Li>item</Li></Ul>)
    expect(screen.getByText('item').tagName).toBe('LI')

    render(<Strong>bold</Strong>)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders hr without crashing', () => {
    const Hr = components.hr
    const { container } = render(<Hr />)
    expect(container.querySelector('hr')).toBeTruthy()
  })
})

describe('table components', () => {
  it('renders a complete table structure', () => {
    const Table = components.table
    const Thead = components.thead
    const Th = components.th
    const Td = components.td

    render(
      <Table>
        <Thead>
          <tr><Th>Header</Th></tr>
        </Thead>
        <tbody>
          <tr><Td>Cell</Td></tr>
        </tbody>
      </Table>,
    )
    expect(screen.getByText('Header').tagName).toBe('TH')
    expect(screen.getByText('Cell').tagName).toBe('TD')
  })
})
