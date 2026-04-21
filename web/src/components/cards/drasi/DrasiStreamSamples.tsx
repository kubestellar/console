/**
 * Stream sample drawer — per-language code snippets showing how to consume
 * a Drasi SSE reaction stream from an external app.
 *
 * Exports: StreamSampleDrawer, STREAM_SAMPLES, StreamSample
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Code2, Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { go } from '@codemirror/legacy-modes/mode/go'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { oneDark } from '@codemirror/theme-one-dark'
import { STREAM_COPY_FLASH_MS } from './DrasiConstants'

// ---------------------------------------------------------------------------
// Stream sample definitions
// ---------------------------------------------------------------------------

export interface StreamSample {
  lang: string
  label: string
  lineExt: ReturnType<typeof StreamLanguage.define>
  snippet: (endpoint: string) => string
}

// Snippets are intentionally minimal — subscribe, log deltas, that's it.
// Users will copy them as a starting point. All snippets assume the
// endpoint emits drasi-server's `{added, updated, deleted}` delta shape.
export const STREAM_SAMPLES: StreamSample[] = [
  {
    lang: 'js',
    label: 'JavaScript (browser)',
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `const es = new EventSource('${endpoint}')

es.onmessage = (ev) => {
  const delta = JSON.parse(ev.data)
  // delta.added / delta.updated / delta.deleted are arrays of result rows.
  for (const row of delta.added ?? []) console.log('added', row)
  for (const row of delta.updated ?? []) console.log('updated', row)
  for (const row of delta.deleted ?? []) console.log('deleted', row)
}

es.onerror = () => console.error('SSE connection lost — browser will retry')
`,
  },
  {
    lang: 'node',
    label: 'Node.js',
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `// npm install eventsource
import EventSource from 'eventsource'

const es = new EventSource('${endpoint}')

es.on('message', (ev) => {
  const delta = JSON.parse(ev.data)
  for (const row of delta.added ?? []) console.log('added', row)
  for (const row of delta.updated ?? []) console.log('updated', row)
  for (const row of delta.deleted ?? []) console.log('deleted', row)
})

es.on('error', (err) => console.error('stream error', err))
`,
  },
  {
    lang: 'python',
    label: 'Python',
    lineExt: StreamLanguage.define(python),
    snippet: (endpoint) => `# pip install httpx
import httpx, json

with httpx.stream('GET', '${endpoint}', timeout=None) as r:
    for line in r.iter_lines():
        if not line.startswith('data:'):
            continue
        delta = json.loads(line[5:].strip())
        for row in delta.get('added', []):    print('added', row)
        for row in delta.get('updated', []):  print('updated', row)
        for row in delta.get('deleted', []):  print('deleted', row)
`,
  },
  {
    lang: 'curl',
    label: 'curl',
    lineExt: StreamLanguage.define(shell),
    snippet: (endpoint) => `curl -N -H 'Accept: text/event-stream' '${endpoint}'
`,
  },
  {
    lang: 'go',
    label: 'Go',
    lineExt: StreamLanguage.define(go),
    snippet: (endpoint) => `package main

import (
\t"bufio"
\t"encoding/json"
\t"fmt"
\t"net/http"
\t"strings"
)

func main() {
\tresp, err := http.Get("${endpoint}")
\tif err != nil { panic(err) }
\tdefer resp.Body.Close()

\tscan := bufio.NewScanner(resp.Body)
\tfor scan.Scan() {
\t\tline := scan.Text()
\t\tif !strings.HasPrefix(line, "data:") { continue }
\t\tvar delta struct {
\t\t\tAdded   []map[string]any \`json:"added"\`
\t\t\tUpdated []map[string]any \`json:"updated"\`
\t\t\tDeleted []map[string]any \`json:"deleted"\`
\t\t}
\t\tif err := json.Unmarshal([]byte(strings.TrimSpace(line[5:])), &delta); err != nil { continue }
\t\tfmt.Printf("added=%d updated=%d deleted=%d\\n", len(delta.Added), len(delta.Updated), len(delta.Deleted))
\t}
}
`,
  },
  {
    lang: 'csharp',
    label: 'C# / .NET',
    // legacy-modes has no dedicated C# mode; fall back to javascript which
    // handles strings/keywords/comments reasonably for this snippet.
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `using System.Net.Http;
using System.Text.Json;

var http = new HttpClient();
using var stream = await http.GetStreamAsync("${endpoint}");
using var reader = new StreamReader(stream);

while (!reader.EndOfStream) {
    var line = await reader.ReadLineAsync();
    if (line is null || !line.StartsWith("data:")) continue;
    using var doc = JsonDocument.Parse(line[5..].Trim());
    Console.WriteLine(doc.RootElement);
}
`,
  },
]

// ---------------------------------------------------------------------------
// StreamSampleDrawer component
// ---------------------------------------------------------------------------

interface StreamSampleDrawerProps {
  /** Endpoint the snippets should point at. Demo mode uses a placeholder
   *  with a banner; live mode uses the real proxy URL. */
  endpoint: string
  isDemo: boolean
  onClose: () => void
}

export function StreamSampleDrawer({ endpoint, isDemo, onClose }: StreamSampleDrawerProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(STREAM_SAMPLES[0].lang)
  const [copied, setCopied] = useState(false)
  const sample = STREAM_SAMPLES.find(s => s.lang === tab) ?? STREAM_SAMPLES[0]
  const snippet = sample.snippet(endpoint)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), STREAM_COPY_FLASH_MS)
    } catch {
      // Clipboard denied — user can still select manually.
    }
  }

  return (
    <motion.div
      // Drawer capped at min(75% of card, 720px) so code snippets get
      // breathing room without wall-to-walling the whole card on wide
      // viewports. Was a flat 480px — too cramped for Go / C# samples.
      className="absolute top-0 right-0 bottom-0 z-40 w-[min(75%,720px)] min-w-[520px] bg-slate-950 border-l border-slate-700 shadow-2xl flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 py-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t('drasi.consumeStreamTitle')}</span>
        </div>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isDemo && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 text-[10px] text-yellow-200">
          {t('drasi.streamDemoHint')}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800/60 overflow-x-auto">
        {STREAM_SAMPLES.map(s => (
          <button
            key={s.lang}
            type="button"
            onClick={() => setTab(s.lang)}
            className={`shrink-0 px-2 py-1 text-[10px] rounded uppercase tracking-wider ${
              tab === s.lang
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-200'
                : 'border border-transparent text-slate-400 hover:text-cyan-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-y-2 border-b border-slate-800/60">
        <code className="text-[10px] text-muted-foreground font-mono truncate flex-1 mr-2">{endpoint}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1"
          aria-label={t('drasi.copySnippet')}
        >
          {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
          {copied ? t('drasi.copied') : t('drasi.copy')}
        </button>
      </div>

      <div className="flex-1 overflow-hidden text-xs">
        <CodeMirror
          value={snippet}
          theme={oneDark}
          extensions={[sample.lineExt]}
          editable={false}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
          }}
        />
      </div>
    </motion.div>
  )
}
