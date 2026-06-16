package rag

import "math"

// Embedder turns text into a dense vector. Implementations MUST be deterministic
// (same text -> same vector) so the index can be rebuilt at startup without
// drift, and MUST return L2-normalized vectors of length Dim().
//
// EmbedQuery and EmbedPassage are kept separate to support asymmetric encoding:
// a search query and a stored document are weighted differently, mirroring the
// "Query:"/"Document:" prefix convention of jina-embeddings-v5.
type Embedder interface {
	Dim() int
	EmbedQuery(text string) []float32
	EmbedPassage(text string) []float32
}

// cosine returns the dot product of two L2-normalized vectors, which equals
// their cosine similarity. Vectors are assumed normalized and equal length.
func cosine(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
	}
	return dot
}

// normalize scales v to unit L2 length in place and returns it.
func normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return v
	}
	inv := float32(1.0 / math.Sqrt(sum))
	for i := range v {
		v[i] *= inv
	}
	return v
}

// Truncate applies Matryoshka-style dimension reduction: it keeps the first
// `dim` components and re-normalizes. Lower dims trade recall for memory/speed.
// Returns v unchanged if dim is out of range.
func Truncate(v []float32, dim int) []float32 {
	if dim <= 0 || dim >= len(v) {
		return v
	}
	out := make([]float32, dim)
	copy(out, v[:dim])
	return normalize(out)
}

// Quantize packs a vector into a binary code (1 bit per dimension, sign-based)
// for cheap Hamming-distance pre-filtering. Bit i is 1 when v[i] >= 0.
func Quantize(v []float32) []uint64 {
	code := make([]uint64, (len(v)+63)/64)
	for i, x := range v {
		if x >= 0 {
			code[i/64] |= 1 << uint(i%64)
		}
	}
	return code
}

// hamming returns the number of differing bits between two binary codes.
func hamming(a, b []uint64) int {
	if len(a) != len(b) {
		return math.MaxInt32
	}
	var d int
	for i := range a {
		d += popcount(a[i] ^ b[i])
	}
	return d
}

func popcount(x uint64) int {
	var c int
	for x != 0 {
		x &= x - 1
		c++
	}
	return c
}
