package rag

import (
	"math"
	"testing"
)

func TestCosine_IdenticalVectors(t *testing.T) {
	v := []float32{0.6, 0.8}
	if got := cosine(v, v); math.Abs(got-1.0) > 1e-6 {
		t.Fatalf("identical normalized vectors: got %f, want 1.0", got)
	}
}

func TestCosine_OrthogonalVectors(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{0, 1, 0}
	if got := cosine(a, b); math.Abs(got) > 1e-6 {
		t.Fatalf("orthogonal: got %f, want 0.0", got)
	}
}

func TestCosine_OppositeVectors(t *testing.T) {
	a := []float32{1, 0}
	b := []float32{-1, 0}
	if got := cosine(a, b); math.Abs(got+1.0) > 1e-6 {
		t.Fatalf("opposite: got %f, want -1.0", got)
	}
}

func TestCosine_DifferentLengths(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{1, 0}
	if got := cosine(a, b); got != 0 {
		t.Fatalf("mismatched lengths should return 0, got %f", got)
	}
}

func TestNormalize_UnitLength(t *testing.T) {
	v := normalize([]float32{3, 4})
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if math.Abs(sum-1.0) > 1e-5 {
		t.Fatalf("not unit length: L2^2=%f", sum)
	}
}

func TestNormalize_ZeroVector(t *testing.T) {
	v := normalize([]float32{0, 0, 0})
	for i, x := range v {
		if x != 0 {
			t.Fatalf("zero vector should stay zero, v[%d]=%f", i, x)
		}
	}
}

func TestNormalize_Idempotent(t *testing.T) {
	v := normalize([]float32{1, 2, 3})
	v2 := normalize(v)
	for i := range v {
		if math.Abs(float64(v[i]-v2[i])) > 1e-6 {
			t.Fatalf("not idempotent at %d: %f vs %f", i, v[i], v2[i])
		}
	}
}

func TestTruncate_ReducesDimension(t *testing.T) {
	v := normalize([]float32{1, 2, 3, 4, 5, 6, 7, 8})
	tv := Truncate(v, 4)
	if len(tv) != 4 {
		t.Fatalf("expected dim 4, got %d", len(tv))
	}
	// Result should be re-normalized
	var sum float64
	for _, x := range tv {
		sum += float64(x) * float64(x)
	}
	if math.Abs(sum-1.0) > 1e-5 {
		t.Fatalf("truncated vector not normalized: L2^2=%f", sum)
	}
}

func TestTruncate_NoDimReduction(t *testing.T) {
	v := []float32{0.6, 0.8}
	// dim >= len(v) should return unchanged
	tv := Truncate(v, 10)
	if &tv[0] != &v[0] {
		t.Fatal("no reduction needed, should return same slice")
	}
}

func TestTruncate_ZeroDim(t *testing.T) {
	v := []float32{0.6, 0.8}
	tv := Truncate(v, 0)
	if &tv[0] != &v[0] {
		t.Fatal("dim<=0 should return unchanged")
	}
}

func TestQuantize_BasicBits(t *testing.T) {
	// 4 elements: positive, negative, zero, positive
	v := []float32{1.0, -0.5, 0.0, 0.3}
	code := Quantize(v)
	if len(code) != 1 { // 4 elements fits in one uint64
		t.Fatalf("expected 1 uint64, got %d", len(code))
	}
	// Bit 0: v[0]=1.0 >= 0 -> 1
	// Bit 1: v[1]=-0.5 < 0 -> 0
	// Bit 2: v[2]=0.0 >= 0 -> 1
	// Bit 3: v[3]=0.3 >= 0 -> 1
	expected := uint64(1) | uint64(0)<<1 | uint64(1)<<2 | uint64(1)<<3 // 0b1101 = 13
	if code[0] != expected {
		t.Fatalf("got 0b%b, want 0b%b", code[0], expected)
	}
}

func TestQuantize_MultipleUint64(t *testing.T) {
	v := make([]float32, 128) // needs 2 uint64s
	for i := range v {
		v[i] = 1.0 // all positive
	}
	code := Quantize(v)
	if len(code) != 2 {
		t.Fatalf("128 dims needs 2 uint64s, got %d", len(code))
	}
	if code[0] != ^uint64(0) || code[1] != ^uint64(0) {
		t.Fatal("all-positive vector should set all bits")
	}
}

func TestHamming_Identical(t *testing.T) {
	a := []uint64{0xAAAAAAAA, 0x55555555}
	if got := hamming(a, a); got != 0 {
		t.Fatalf("identical codes: got %d, want 0", got)
	}
}

func TestHamming_AllDifferent(t *testing.T) {
	a := []uint64{0}
	b := []uint64{^uint64(0)}
	if got := hamming(a, b); got != 64 {
		t.Fatalf("all bits different: got %d, want 64", got)
	}
}

func TestHamming_DifferentLengths(t *testing.T) {
	a := []uint64{0, 0}
	b := []uint64{0}
	if got := hamming(a, b); got != math.MaxInt32 {
		t.Fatalf("mismatched lengths: got %d, want MaxInt32", got)
	}
}

func TestPopcount(t *testing.T) {
	cases := []struct {
		in   uint64
		want int
	}{
		{0, 0},
		{1, 1},
		{0xFF, 8},
		{^uint64(0), 64},
		{0xAAAAAAAAAAAAAAAA, 32},
	}
	for _, tc := range cases {
		if got := popcount(tc.in); got != tc.want {
			t.Errorf("popcount(%x): got %d, want %d", tc.in, got, tc.want)
		}
	}
}
