package scheduler

import (
	"fmt"
	"math"
	"strconv"
	"testing"
)

func TestReadInt32(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]any
		want    int32
		wantErr bool
	}{
		{
			name:   "accepts string within range",
			params: map[string]any{"replicas": "42"},
			want:   42,
		},
		{
			name:    "rejects overflowing string",
			params:  map[string]any{"replicas": fmt.Sprintf("%d", int64(math.MaxInt32)+1)},
			wantErr: true,
		},
		{
			name:    "rejects overflowing int64",
			params:  map[string]any{"replicas": int64(math.MaxInt32) + 1},
			wantErr: true,
		},
		{
			name:    "rejects fractional float64",
			params:  map[string]any{"replicas": 1.5},
			wantErr: true,
		},
	}

	if strconv.IntSize > 32 {
		tests = append(tests, struct {
			name    string
			params  map[string]any
			want    int32
			wantErr bool
		}{
			name:    "rejects overflowing int",
			params:  map[string]any{"replicas": int(int64(math.MaxInt32) + 1)},
			wantErr: true,
		})
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := readInt32(tt.params, "replicas")
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}
