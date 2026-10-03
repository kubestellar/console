package k8s

import "math"

// safeInt32 converts an int64 to int32, clamping to [math.MinInt32, math.MaxInt32]
// to prevent integer overflow.
func safeInt32(v int64) int32 {
	if v > math.MaxInt32 {
		return math.MaxInt32
	}
	if v < math.MinInt32 {
		return math.MinInt32
	}
	return int32(v)
}

// safeFloat64ToInt32 converts a float64 to int32, clamping to [math.MinInt32, math.MaxInt32].
func safeFloat64ToInt32(v float64) int32 {
	if v > math.MaxInt32 {
		return math.MaxInt32
	}
	if v < math.MinInt32 {
		return math.MinInt32
	}
	return int32(v)
}
