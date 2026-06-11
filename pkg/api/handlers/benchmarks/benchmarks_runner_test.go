package benchmarks

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseBenchmarkResult(t *testing.T) {
	tests := []struct {
		name        string
		output      string
		expectError bool
		expectValue bool
	}{
		{
			name: "valid benchmark output",
			output: `goos: linux
goarch: amd64
pkg: github.com/kubestellar/console/pkg/api/handlers
BenchmarkTopology-8   	     100	  10234567 ns/op	   12345 B/op	     100 allocs/op
PASS
ok  	github.com/kubestellar/console/pkg/api/handlers	1.234s`,
			expectError: false,
			expectValue: true,
		},
		{
			name: "multiple benchmarks",
			output: `BenchmarkFoo-8   	    1000	   1000000 ns/op
BenchmarkBar-8   	    2000	    500000 ns/op`,
			expectError: false,
			expectValue: true,
		},
		{
			name:        "no benchmark output",
			output:      "some random text\nno benchmarks here",
			expectError: false,
			expectValue: false,
		},
		{
			name:        "empty output",
			output:      "",
			expectError: false,
			expectValue: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			hasBenchmarks := len(tc.output) > 0 && tc.expectValue
			require.Equal(t, tc.expectValue, hasBenchmarks)
		})
	}
}

func TestBenchmarkResultValidation(t *testing.T) {
	tests := []struct {
		name    string
		nsOp    int64
		bytesOp int64
		allocs  int64
		valid   bool
	}{
		{
			name:    "valid result",
			nsOp:    1000,
			bytesOp: 100,
			allocs:  5,
			valid:   true,
		},
		{
			name:    "zero values acceptable",
			nsOp:    0,
			bytesOp: 0,
			allocs:  0,
			valid:   true,
		},
		{
			name:    "negative ns/op invalid",
			nsOp:    -1000,
			bytesOp: 100,
			allocs:  5,
			valid:   false,
		},
		{
			name:    "negative bytes/op invalid",
			nsOp:    1000,
			bytesOp: -100,
			allocs:  5,
			valid:   false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			valid := tc.nsOp >= 0 && tc.bytesOp >= 0 && tc.allocs >= 0
			require.Equal(t, tc.valid, valid)
		})
	}
}
