import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isExportOnlyStub } from './check-export-only-tests.mjs'

const cases = [
  ['no expectations at all is not a stub', 'import { foo } from "./foo"\ntest("noop", () => {})', false],
  [
    'toBeDefined only is a stub',
    'import { foo } from "./foo"\ntest("exists", () => { expect(foo).toBeDefined() })',
    true,
  ],
  [
    'toBeTruthy only is a stub',
    'import { foo } from "./foo"\ntest("truthy", () => { expect(foo).toBeTruthy() })',
    true,
  ],
  [
    'not.toBeUndefined is a stub',
    'import { foo } from "./foo"\ntest("defined", () => { expect(foo).not.toBeUndefined() })',
    true,
  ],
  [
    'typeof toBe function is a stub',
    'import { foo } from "./foo"\ntest("is function", () => { expect(typeof foo).toBe("function") })',
    true,
  ],
  [
    'multiple trivial expects are still a stub',
    [
      'import { foo, bar } from "./foo"',
      'test("exports", () => {',
      '  expect(foo).toBeDefined()',
      '  expect(bar).toBeTruthy()',
      '})',
    ].join('\n'),
    true,
  ],
  [
    'a single non-trivial expect disqualifies the stub',
    [
      'import { foo, add } from "./foo"',
      'test("exports and behavior", () => {',
      '  expect(foo).toBeDefined()',
      '  expect(add(1, 2)).toBe(3)',
      '})',
    ].join('\n'),
    false,
  ],
  [
    'rendering disqualifies the stub even with only trivial expects',
    [
      'import { render } from "@testing-library/react"',
      'import { Widget } from "./Widget"',
      'test("renders", () => {',
      '  render(<Widget />)',
      '  expect(Widget).toBeDefined()',
      '})',
    ].join('\n'),
    false,
  ],
  [
    'renderHook disqualifies the stub',
    [
      'import { renderHook } from "@testing-library/react"',
      'import { useFoo } from "./useFoo"',
      'test("hook", () => {',
      '  renderHook(() => useFoo())',
      '  expect(useFoo).toBeDefined()',
      '})',
    ].join('\n'),
    false,
  ],
]

for (const [name, source, expected] of cases) {
  test(name, () => assert.equal(isExportOnlyStub(source), expected))
}
