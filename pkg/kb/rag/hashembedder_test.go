package rag

import (
	"math"
	"testing"
)

func TestNewHashEmbedder_DefaultDim(t *testing.T) {
	e := NewHashEmbedder([]string{"hello world"}, 0)
	if e.Dim() != defaultDim {
		t.Fatalf("dim<=0 should use default %d, got %d", defaultDim, e.Dim())
	}
}

func TestNewHashEmbedder_CustomDim(t *testing.T) {
	e := NewHashEmbedder([]string{"hello world"}, 128)
	if e.Dim() != 128 {
		t.Fatalf("expected 128, got %d", e.Dim())
	}
}

func TestHashEmbedder_Deterministic(t *testing.T) {
	corpus := []string{"install prometheus monitoring", "deploy linkerd service mesh"}
	e := NewHashEmbedder(corpus, 64)
	v1 := e.EmbedQuery("install monitoring")
	v2 := e.EmbedQuery("install monitoring")
	for i := range v1 {
		if v1[i] != v2[i] {
			t.Fatalf("not deterministic at dim %d: %f vs %f", i, v1[i], v2[i])
		}
	}
}

func TestHashEmbedder_NormalizedOutput(t *testing.T) {
	corpus := []string{"install prometheus monitoring", "configure cert-manager tls"}
	e := NewHashEmbedder(corpus, 64)
	tests := []struct {
		name string
		vec  []float32
	}{
		{"query", e.EmbedQuery("install monitoring")},
		{"passage", e.EmbedPassage("install prometheus on kubernetes cluster")},
	}
	for _, tc := range tests {
		var sum float64
		for _, x := range tc.vec {
			sum += float64(x) * float64(x)
		}
		if math.Abs(sum-1.0) > 1e-4 {
			t.Errorf("%s: not unit normalized, L2^2=%f", tc.name, sum)
		}
	}
}

func TestHashEmbedder_QueryPassageAsymmetry(t *testing.T) {
	corpus := []string{"prometheus metrics alerting prometheus monitoring prometheus"}
	e := NewHashEmbedder(corpus, 64)
	// Use text where a term repeats so TF weighting (passage) differs from IDF weighting (query)
	text := "prometheus prometheus prometheus metrics"
	q := e.EmbedQuery(text)
	p := e.EmbedPassage(text)
	// With repeated terms, sublinear TF (1+log(count)) != 1, causing asymmetry
	same := true
	for i := range q {
		if q[i] != p[i] {
			same = false
			break
		}
	}
	if same {
		t.Fatal("query and passage embeddings should be asymmetric for repeated terms")
	}
}

func TestHashEmbedder_SimilarQueriesHighCosine(t *testing.T) {
	corpus := []string{
		"install prometheus monitoring",
		"deploy grafana dashboards",
		"configure ingress nginx",
	}
	e := NewHashEmbedder(corpus, 256)
	q1 := e.EmbedQuery("install prometheus")
	q2 := e.EmbedQuery("set up prometheus monitoring")
	sim := cosine(q1, q2)
	if sim < 0.1 {
		t.Fatalf("similar queries should have decent cosine, got %f", sim)
	}
}

func TestHashEmbedder_DissimilarQueriesLowCosine(t *testing.T) {
	corpus := []string{
		"install prometheus monitoring metrics alerting",
		"configure ingress nginx networking http",
		"deploy velero backup disaster recovery",
	}
	e := NewHashEmbedder(corpus, 256)
	q1 := e.EmbedQuery("prometheus monitoring alerting")
	q2 := e.EmbedQuery("velero backup disaster recovery")
	sim := cosine(q1, q2)
	if sim > 0.5 {
		t.Fatalf("dissimilar queries should have low cosine, got %f", sim)
	}
}

func TestHashEmbedder_EmptyCorpus(t *testing.T) {
	e := NewHashEmbedder(nil, 64)
	v := e.EmbedQuery("anything")
	if len(v) != 64 {
		t.Fatalf("empty corpus: dim should still be 64, got %d", len(v))
	}
	// OOV tokens get default IDF=3.0, should produce non-zero vector
	nonzero := false
	for _, x := range v {
		if x != 0 {
			nonzero = true
			break
		}
	}
	if !nonzero {
		t.Fatal("query against empty corpus should still produce non-zero vector")
	}
}

func TestHashEmbedder_IdfOfOOV(t *testing.T) {
	e := NewHashEmbedder([]string{"known term"}, 64)
	oov := e.idfOf("unknowntoken12345")
	if oov != 3.0 {
		t.Fatalf("OOV default IDF: got %f, want 3.0", oov)
	}
}

func TestHashEmbedder_IdfOfKnown(t *testing.T) {
	e := NewHashEmbedder([]string{"prometheus metrics", "prometheus alerts"}, 64)
	// "prometheus" appears in both docs, so IDF should be low
	idf := e.idfOf("prometheus")
	if idf <= 0 {
		t.Fatal("IDF should be positive")
	}
	// "metrics" appears in 1/2 docs, higher IDF
	idfMetrics := e.idfOf("metrics")
	if idfMetrics <= idf {
		t.Fatalf("rarer term should have higher IDF: metrics=%f, prometheus=%f", idfMetrics, idf)
	}
}
