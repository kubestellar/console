import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRefreshSpin } from './check-refresh-spin.mjs'

const cases = [
  ['imports are not rendered icons', 'import { RefreshCw } from "lucide-react"', 0],
  ['static metadata is not a refresh control', '<div><RefreshCw className="w-4 h-4" />Revision: 1</div>', 0],
  ['invert selection is synchronous', '<button onClick={invertSelection}><RefreshCw /></button>', 0],
  ['missing feedback on a busy control', '<button disabled={isLoading}><RefreshCw /></button>', 1],
  ['multiline conditional class', '<button disabled={isRefreshing}><RefreshCw\n className={cn("w-4 h-4", isRefreshing && "animate-spin")} /></button>', 0],
  ['ternary class', '<button disabled={isFetching}><RefreshCcw className={isFetching ? "animate-spin" : ""} /></button>', 0],
  ['alternate loading icon', '<Button disabled={isLoading}>{isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}</Button>', 0],
  ['conditionally rendered spinner', '<button disabled={isExecuting}>{isExecuting && <RefreshCw className="animate-spin" />}</button>', 0],
  ['loading branch outside control', '{pending && <button disabled={pending}><RefreshCw className="animate-spin" /></button>}', 0],
  ['unconditional busy control spinner', '<Button disabled={isLoading}><RefreshCw className="animate-spin" /></Button>', 1],
  ['unrelated spinner does not hide missing feedback', '<><Loader2 className="animate-spin" /><button disabled={isLoading}><RefreshCw /></button></>', 1],
  ['button transitions are not animation overrides', '<button disabled={isRefreshing} className="transition-colors duration-200"><RefreshCw className={cn("w-4", isRefreshing && "animate-spin")} /></button>', 0],
  ['icon animation override', '<button disabled={isLoading}><RefreshCw className={isLoading ? "animate-spin" : ""} style={{animationDuration: "2s"}} /></button>', 1],
]

for (const [name, source, expected] of cases) {
  test(name, () => assert.equal(checkRefreshSpin(source).length, expected))
}

test('findings include the actual icon location', () => {
  assert.match(checkRefreshSpin('<button disabled={isLoading}>\n<RefreshCw />\n</button>', 'example.tsx')[0], /example\.tsx:2/)
})
