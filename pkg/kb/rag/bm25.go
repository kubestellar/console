package rag

import "math"

// BM25 parameters (Okapi BM25). k1 controls term-frequency saturation; b
// controls length normalization. These are the standard defaults.
const (
	bm25K1 = 1.2
	bm25B  = 0.75
)

// bm25Index is a lexical scorer over the corpus. It complements the dense
// embedder: BM25 is precise on exact term overlap (e.g. project names), where
// hashed dense vectors generalize over subwords.
type bm25Index struct {
	docTokens [][]string
	docLen    []float64
	avgLen    float64
	idf       map[string]float64
	termFreq  []map[string]int
}

func newBM25Index(corpus []string) *bm25Index {
	idx := &bm25Index{
		docTokens: make([][]string, len(corpus)),
		docLen:    make([]float64, len(corpus)),
		termFreq:  make([]map[string]int, len(corpus)),
		idf:       make(map[string]float64),
	}
	df := make(map[string]int)
	var total float64
	for i, doc := range corpus {
		toks := tokenize(doc)
		idx.docTokens[i] = toks
		idx.docLen[i] = float64(len(toks))
		total += float64(len(toks))
		tf := make(map[string]int)
		seen := make(map[string]struct{})
		for _, t := range toks {
			tf[t]++
			if _, ok := seen[t]; !ok {
				seen[t] = struct{}{}
				df[t]++
			}
		}
		idx.termFreq[i] = tf
	}
	if len(corpus) > 0 {
		idx.avgLen = total / float64(len(corpus))
	}
	// Guard against a zero average length (every document tokenized to nothing,
	// e.g. empty text or all-stopword input). A zero avgLen would make the
	// length-normalization term divide by zero and yield Inf/NaN scores.
	if idx.avgLen == 0 {
		idx.avgLen = 1
	}
	n := float64(len(corpus))
	for term, d := range df {
		idx.idf[term] = math.Log(1 + (n-float64(d)+0.5)/(float64(d)+0.5))
	}
	return idx
}

// scoreAll returns the BM25 score of the query against every document.
func (idx *bm25Index) scoreAll(query string) []float64 {
	qTerms := tokenize(query)
	scores := make([]float64, len(idx.docTokens))
	for i := range idx.docTokens {
		var s float64
		tf := idx.termFreq[i]
		dl := idx.docLen[i]
		for _, term := range qTerms {
			f := float64(tf[term])
			if f == 0 {
				continue
			}
			idf := idx.idf[term]
			denom := f + bm25K1*(1-bm25B+bm25B*dl/idx.avgLen)
			s += idf * (f * (bm25K1 + 1) / denom)
		}
		scores[i] = s
	}
	return scores
}
