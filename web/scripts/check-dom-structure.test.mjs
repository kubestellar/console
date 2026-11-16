import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDomStructure } from './check-dom-structure.mjs'

const categories = source => checkDomStructure(source).map(finding => finding.category)

test('ignores adjacent elements, comments, SVG tags and long lists', () => {
  assert.deepEqual(categories(`
    <><button>one</button><button>two</button>
    <p>text</p><div /> <pre>text</pre>
    <h3>one</h3><h4>two</h4>
    <svg><linearGradient /><line /></svg>
    {/* <li> */}
    <ul>${'<li>item</li>'.repeat(12)}{items.map(item => <li>{item}</li>)}</ul>
    </>
  `), [])
})

test('reports actual JSX ancestry through expressions and fragments', () => {
  assert.deepEqual(categories(`
    <><button><span><button /></span></button>
    <p>{ok && <><section /></>}</p>
    <div><li>orphan</li></div>
    <h2><span><h3>nested</h3></span></h2></>
  `), ['button', 'paragraph', 'list', 'heading'])
})

test('allows a list item supplied to an unknown list component', () => {
  assert.deepEqual(categories('<List><li>item</li></List>'), [])
  assert.deepEqual(categories('const ListItem = () => <li>item</li>'), [])
})
