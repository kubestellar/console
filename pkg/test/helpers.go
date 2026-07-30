package test

import "github.com/stretchr/testify/mock"

// MatchAny returns mock.Anything — a testify sentinel value that matches any
// argument when used with mockStore.On(...).
// Use wherever a mock expectation should accept any value for a parameter.
func MatchAny() interface{} {
	return mock.Anything
}
