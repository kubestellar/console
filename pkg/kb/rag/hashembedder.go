package rag

import (
	"hash/fnv"
	"math"
)

const (
	defaultDim = 512
	// trigramWeight discounts subword features relative to whole-word features.
	trigramWeight = 0.35
)

// HashEmbedder is a zero-dependency dense encoder. It maps tokens (and their
// character trigrams, for subword robustness) into a fixed-dimensional vector
// via signed feature hashing, weighted by inverse document frequency (IDF) so
// rare, discriminative terms dominate. Vectors are L2-normalized.
//
// It is intentionally model-free: no weights to download, deterministic, and
// fast enough to embed the whole KB at startup. It captures lexical and subword
// overlap, not deep semantics — the Embedder interface is where a neural model
// is substituted when stronger vocabulary bridging is required. Asymmetry
// between queries and passages is realized through IDF weighting on the query
// side and sublinear (log) term-frequency weighting on the passage side, the
// same query/document distinction Jina draws with input prefixes.
type HashEmbedder struct {
	dim int
	idf map[string]float64 // token -> inverse document frequency
}

// NewHashEmbedder fits an embedder against a corpus of documents, computing IDF
// weights over the shared tokenizer's vocabulary. dim<=0 uses the default.
func NewHashEmbedder(corpus []string, dim int) *HashEmbedder {
	if dim <= 0 {
		dim = defaultDim
	}
	df := make(map[string]int)
	for _, doc := range corpus {
		seen := make(map[string]struct{})
		for _, tok := range tokenize(doc) {
			if _, ok := seen[tok]; ok {
				continue
			}
			seen[tok] = struct{}{}
			df[tok]++
		}
	}
	n := float64(len(corpus))
	idf := make(map[string]float64, len(df))
	for tok, d := range df {
		// Smoothed IDF (BM25-style), floored at a small positive value so every
		// term contributes something.
		v := math.Log(1 + (n-float64(d)+0.5)/(float64(d)+0.5))
		if v < 0.1 {
			v = 0.1
		}
		idf[tok] = v
	}
	return &HashEmbedder{dim: dim, idf: idf}
}

// Dim returns the embedding dimensionality.
func (e *HashEmbedder) Dim() int { return e.dim }

// idfOf returns the IDF weight for a token, defaulting to a high weight for
// out-of-vocabulary terms (they are rare by definition).
func (e *HashEmbedder) idfOf(tok string) float64 {
	if w, ok := e.idf[tok]; ok {
		return w
	}
	return 3.0
}

// embed builds a vector from token counts. When idfWeighted is true (query
// side) terms are weighted by IDF; otherwise (passage side) by sublinear TF.
func (e *HashEmbedder) embed(text string, idfWeighted bool) []float32 {
	vec := make([]float32, e.dim)
	counts := make(map[string]int)
	for _, tok := range tokenize(text) {
		counts[tok]++
	}
	for tok, c := range counts {
		var w float64
		if idfWeighted {
			w = e.idfOf(tok)
		} else {
			w = (1 + math.Log(float64(c))) * e.idfOf(tok)
		}
		e.addFeature(vec, tok, w)
		for _, tg := range charTrigrams(tok) {
			e.addFeature(vec, tg, w*trigramWeight)
		}
	}
	return normalize(vec)
}

// addFeature hashes a feature into the vector with a deterministic sign, the
// "signed feature hashing" trick that keeps collisions unbiased.
func (e *HashEmbedder) addFeature(vec []float32, feature string, weight float64) {
	h := fnv.New64a()
	_, _ = h.Write([]byte(feature))
	sum := h.Sum64()
	idx := int(sum % uint64(e.dim))
	sign := float32(1)
	if sum&(1<<63) != 0 {
		sign = -1
	}
	vec[idx] += sign * float32(weight)
}

// EmbedQuery embeds a search query (IDF-weighted).
func (e *HashEmbedder) EmbedQuery(text string) []float32 {
	return e.embed(text, true)
}

// EmbedPassage embeds a stored document (sublinear-TF weighted).
func (e *HashEmbedder) EmbedPassage(text string) []float32 {
	return e.embed(text, false)
}
