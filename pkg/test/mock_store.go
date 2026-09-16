package test

import (
	"context"
	"database/sql"

	"github.com/stretchr/testify/mock"
)

// MockStore is a mock implementation of store.Store
type MockStore struct {
	mock.Mock
}

func (m *MockStore) hasExpectation(method string) bool {
	for _, call := range m.ExpectedCalls {
		if call.Method == method {
			return true
		}
	}
	return false
}

func (m *MockStore) WithTransaction(ctx context.Context, fn func(tx *sql.Tx) error) error {
	return fn(nil)
}

func (m *MockStore) Close() error { return nil }
