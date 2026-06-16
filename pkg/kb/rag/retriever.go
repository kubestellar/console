package rag

import (
	"math"
	"sort"
)

const (
	// rrfK is the Reciprocal Rank Fusion constant. 60 is the value from the
	// original RRF paper and a robust default.
	rrfK = 60.0
	// defaultK is the number of results returned when the caller does not
	// specify a limit.
	defaultK = 5
	// fusionPoolDepth caps how deep each signal's ranking is fused, bounding
	// work on large corpora.
	fusionPoolDepth = 50
	// denseWeight and lexWeight bias Reciprocal Rank Fusion. BM25 is the more
	// precise signal on this corpus, so the dense (recall-oriented) signal is
	// weighted lower to assist rather than add noise.
	denseWeight = 0.6
	lexWeight   = 1.0
	// minDenseCos drops weak dense matches from the fusion pool so unrelated
	// documents do not earn rank credit just by being in the top-50.
	minDenseCos = 0.12
)

// Retriever performs hybrid (dense + lexical) retrieval over a fixed corpus.
// It is safe for concurrent reads after construction.
type Retriever struct {
	docs       []Document
	embedder   Embedder
	bm25       *bm25Index
	chunks     []Chunk
	chunkVecs  [][]float32 // L2-normalized passage vectors, aligned with chunks
	chunkByDoc [][]int     // doc index -> chunk indices
	queryDim   int         // Matryoshka truncation dim (0 = full)
}

// NewRetriever builds a retriever from a corpus and embedder. It embeds every
// chunk once (passage encoding) and fits the BM25 index. matryoshkaDim<=0 keeps
// full-dimension vectors; a smaller value truncates for lower memory.
func NewRetriever(docs []Document, embedder Embedder, matryoshkaDim int) *Retriever {
	r := &Retriever{
		docs:       docs,
		embedder:   embedder,
		chunkByDoc: make([][]int, len(docs)),
		queryDim:   matryoshkaDim,
	}

	lexCorpus := make([]string, len(docs))
	for i, d := range docs {
		lexCorpus[i] = d.searchableText()
		for _, ch := range chunkDocument(i, d) {
			vec := embedder.EmbedPassage(ch.Text)
			if matryoshkaDim > 0 {
				vec = Truncate(vec, matryoshkaDim)
			}
			r.chunks = append(r.chunks, ch)
			r.chunkVecs = append(r.chunkVecs, vec)
			r.chunkByDoc[i] = append(r.chunkByDoc[i], len(r.chunks)-1)
		}
	}
	r.bm25 = newBM25Index(lexCorpus)
	return r
}

// Len reports the number of documents in the corpus.
func (r *Retriever) Len() int { return len(r.docs) }

// Search returns the top-k documents for a query, fusing dense and lexical
// rankings with Reciprocal Rank Fusion. k<=0 uses the default.
func (r *Retriever) Search(query string, k int) []Result {
	if k <= 0 {
		k = defaultK
	}
	if len(r.docs) == 0 || query == "" {
		return nil
	}

	intent := detectIntent(query) // intent uses verbs in the original query
	expanded := expandQuery(query)
	denseScores := r.denseDocScores(expanded)
	lexScores := r.bm25.scoreAll(expanded)

	denseRank := ranking(denseScores)
	lexRank := ranking(lexScores)

	type fused struct {
		doc       int
		score     float64
		denseRank int
		lexRank   int
	}
	fusedByDoc := make(map[int]*fused)
	accumulate := func(rank []int, weight float64, isDense bool) {
		for pos, doc := range rank {
			if pos >= fusionPoolDepth {
				break
			}
			f := fusedByDoc[doc]
			if f == nil {
				f = &fused{doc: doc}
				fusedByDoc[doc] = f
			}
			f.score += weight / (rrfK + float64(pos+1))
			if isDense {
				f.denseRank = pos + 1
			} else {
				f.lexRank = pos + 1
			}
		}
	}
	accumulate(denseRank, denseWeight, true)
	accumulate(lexRank, lexWeight, false)

	out := make([]Result, 0, len(fusedByDoc))
	for _, f := range fusedByDoc {
		// Skip documents with no signal at all in either pool.
		if f.denseRank == 0 && f.lexRank == 0 {
			continue
		}
		out = append(out, Result{
			Document:    r.docs[f.doc],
			Score:       f.score * intent.boost(r.docs[f.doc]),
			DenseRank:   f.denseRank,
			LexicalRank: f.lexRank,
		})
	}
	// Deterministic ordering: score desc, then lexical rank, then dense rank,
	// then document path. Without explicit tie-breakers a Score tie would fall
	// back to the randomized map-iteration order, producing flaky rankings.
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		if ra, rb := rankOrLast(a.LexicalRank), rankOrLast(b.LexicalRank); ra != rb {
			return ra < rb
		}
		if da, db := rankOrLast(a.DenseRank), rankOrLast(b.DenseRank); da != db {
			return da < db
		}
		return a.Document.Path < b.Document.Path
	})
	if len(out) > k {
		out = out[:k]
	}
	return out
}

// denseDocScores returns, for each document, the max cosine similarity between
// the query vector and any of the document's chunk vectors (late-interaction
// style max-pooling).
func (r *Retriever) denseDocScores(query string) []float64 {
	qVec := r.embedder.EmbedQuery(query)
	if r.queryDim > 0 {
		qVec = Truncate(qVec, r.queryDim)
	}
	scores := make([]float64, len(r.docs))
	for docIdx, chunkIdxs := range r.chunkByDoc {
		best := 0.0
		for _, ci := range chunkIdxs {
			if s := cosine(qVec, r.chunkVecs[ci]); s > best {
				best = s
			}
		}
		if best < minDenseCos {
			best = 0 // filtered out of the fusion pool as noise
		}
		scores[docIdx] = best
	}
	return scores
}

// rankOrLast maps an absent rank (0) to a large value so present ranks sort
// ahead of absent ones in tie-breaking.
func rankOrLast(rank int) int {
	if rank == 0 {
		return math.MaxInt32
	}
	return rank
}

// ranking returns document indices ordered by descending score. Documents with
// a non-positive score are dropped so they do not pollute the fusion pool.
func ranking(scores []float64) []int {
	idx := make([]int, 0, len(scores))
	for i, s := range scores {
		if s > 0 {
			idx = append(idx, i)
		}
	}
	sort.SliceStable(idx, func(a, b int) bool { return scores[idx[a]] > scores[idx[b]] })
	return idx
}
