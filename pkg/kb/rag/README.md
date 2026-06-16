# `pkg/kb/rag` — Knowledge-base retrieval

Self-hosted semantic search over the KubeStellar Console knowledge base (CNCF
install missions, fixer missions, operational runbooks). It replaces brittle
exact-slug matching with hybrid retrieval so the AI agent can find the right
mission from a natural-language goal ("set up TLS certs", "reduce my cloud
costs", "my pod gets permission denied").

## Why it exists

The frontend previously matched install intent with a regex + slug lookup
(`web/src/lib/missions/intentMatcher.ts`). It only matched when the user named
the project almost exactly. Queries that didn't match were logged as KB gaps.
This package bridges the vocabulary gap.

## Design (no external dependencies)

Everything runs in-process — no embedding API, no model download — so the
console keeps working in air-gapped deployments. The architecture is *inspired
by* modern embedding stacks (e.g. jina-embeddings-v5) but uses our own
implementation tuned for this corpus:

| Technique | Where | What it does |
|-----------|-------|--------------|
| Asymmetric encoding | `Embedder.EmbedQuery` / `EmbedPassage` | Queries and passages are weighted differently (IDF vs sublinear TF). |
| Hybrid retrieval | `retriever.go` | BM25 lexical + dense vectors fused with Reciprocal Rank Fusion. |
| Late chunking | `corpus.go` | Missions split into title/description/meta chunks; doc score = best chunk (max-pool). |
| Intent boosting | `intent.go` | "install X" prefers install missions over same-project fixers. |
| Query expansion | `expand.go` | Curated concept→keyword map ("monitoring"→prometheus/grafana). |
| Matryoshka truncation | `Truncate` | Vectors can be shortened for lower memory. |
| Binary quantization | `Quantize` | 1-bit-per-dim codes for cheap Hamming pre-filtering. |

The default `Embedder` (`HashEmbedder`) is model-free: deterministic signed
feature hashing of word + character-trigram features, IDF-weighted. It captures
lexical/subword overlap, not deep semantics. The `Embedder` interface is the
single seam where a neural model (ONNX or a pure-Go transformer) can be dropped
in for stronger vocabulary generalization — nothing else in the retriever
changes, and the curated `expand.go` map becomes redundant at that point.

## Usage

```go
docs, _ := rag.ParseCorpus(indexJSON)      // fixes/index.json bytes
r := rag.NewDefaultRetriever(docs)         // builds in ~100ms for ~1600 docs
hits := r.Search("install a service mesh", 5)
```

## Agent tool contract

Exposed at `GET /api/missions/search?q=<query>&k=<n>`. Register with the agent
as `search_missions`:

```
input:  { "query": string (required), "k": int (optional, default 5, max 25) }
output: { "query", "count", "results": [ {
           "path", "title", "description", "category", "missionClass",
           "difficulty", "tags", "cncfProjects", "score" } ] }
```

The agent calls it on install/deploy/fix/troubleshoot intent, then fetches the
chosen mission via `GET /api/missions/file?path=<result.path>`.
