package ai

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInitializationFunctionVariables(t *testing.T) {
	t.Run("GetRegistry is defined", func(t *testing.T) {
		require.NotNil(t, &GetRegistry, "GetRegistry variable should be defined")
	})

	t.Run("InitializeProviders is defined", func(t *testing.T) {
		require.NotNil(t, &InitializeProviders, "InitializeProviders variable should be defined")
	})

	t.Run("SetClusterContextProviders is defined", func(t *testing.T) {
		require.NotNil(t, &SetClusterContextProviders, "SetClusterContextProviders variable should be defined")
	})

	t.Run("GetConfigManager is defined", func(t *testing.T) {
		require.NotNil(t, &GetConfigManager, "GetConfigManager variable should be defined")
	})
}

func TestInitializationFunctionVariables_DefaultNil(t *testing.T) {
	t.Run("function variables are nil by default", func(t *testing.T) {
		require.Nil(t, GetRegistry, "GetRegistry should be nil until implemented")
		require.Nil(t, InitializeProviders, "InitializeProviders should be nil until implemented")
		require.Nil(t, SetClusterContextProviders, "SetClusterContextProviders should be nil until implemented")
		require.Nil(t, GetConfigManager, "GetConfigManager should be nil until implemented")
	})
}

func TestGetRegistry_Implementation(t *testing.T) {
	t.Run("can be assigned and called", func(t *testing.T) {
		originalGetRegistry := GetRegistry
		defer func() { GetRegistry = originalGetRegistry }()

		called := false
		GetRegistry = func() Registry {
			called = true
			return nil
		}

		GetRegistry()
		require.True(t, called, "assigned function should be callable")
	})
}

func TestInitializeProviders_Implementation(t *testing.T) {
	t.Run("can be assigned and called", func(t *testing.T) {
		originalInitializeProviders := InitializeProviders
		defer func() { InitializeProviders = originalInitializeProviders }()

		called := false
		InitializeProviders = func() error {
			called = true
			return nil
		}

		err := InitializeProviders()
		require.NoError(t, err)
		require.True(t, called, "assigned function should be callable")
	})

	t.Run("can return errors", func(t *testing.T) {
		originalInitializeProviders := InitializeProviders
		defer func() { InitializeProviders = originalInitializeProviders }()

		InitializeProviders = func() error {
			return &mockError{msg: "initialization failed"}
		}

		err := InitializeProviders()
		require.Error(t, err)
		require.Contains(t, err.Error(), "initialization failed")
	})
}

func TestSetClusterContextProviders_Implementation(t *testing.T) {
	t.Run("can be assigned and called", func(t *testing.T) {
		originalSetClusterContextProviders := SetClusterContextProviders
		defer func() { SetClusterContextProviders = originalSetClusterContextProviders }()

		called := false
		SetClusterContextProviders = func(bridge interface{}, k8sClient interface{}) {
			called = true
		}

		SetClusterContextProviders(nil, nil)
		require.True(t, called, "assigned function should be callable")
	})

	t.Run("accepts any interface types", func(t *testing.T) {
		originalSetClusterContextProviders := SetClusterContextProviders
		defer func() { SetClusterContextProviders = originalSetClusterContextProviders }()

		var capturedBridge, capturedClient interface{}
		SetClusterContextProviders = func(bridge interface{}, k8sClient interface{}) {
			capturedBridge = bridge
			capturedClient = k8sClient
		}

		mockBridge := &struct{ Name string }{Name: "bridge"}
		mockClient := &struct{ Type string }{Type: "k8s"}

		SetClusterContextProviders(mockBridge, mockClient)

		require.Equal(t, mockBridge, capturedBridge)
		require.Equal(t, mockClient, capturedClient)
	})
}

func TestGetConfigManager_Implementation(t *testing.T) {
	t.Run("can be assigned and called", func(t *testing.T) {
		originalGetConfigManager := GetConfigManager
		defer func() { GetConfigManager = originalGetConfigManager }()

		called := false
		GetConfigManager = func() interface{} {
			called = true
			return nil
		}

		GetConfigManager()
		require.True(t, called, "assigned function should be callable")
	})

	t.Run("can return config manager instance", func(t *testing.T) {
		originalGetConfigManager := GetConfigManager
		defer func() { GetConfigManager = originalGetConfigManager }()

		mockConfig := &struct{ Setting string }{Setting: "value"}
		GetConfigManager = func() interface{} {
			return mockConfig
		}

		result := GetConfigManager()
		require.Equal(t, mockConfig, result)
	})
}

func TestFunctionVariables_ConcurrentAccess(t *testing.T) {
	t.Run("multiple goroutines can read nil safely", func(t *testing.T) {
		done := make(chan bool)

		for i := 0; i < 10; i++ {
			go func() {
				_ = GetRegistry
				_ = InitializeProviders
				_ = SetClusterContextProviders
				_ = GetConfigManager
				done <- true
			}()
		}

		for i := 0; i < 10; i++ {
			<-done
		}
	})
}

func TestFunctionVariables_GuardPattern(t *testing.T) {
	t.Run("nil check before calling GetRegistry", func(t *testing.T) {
		if GetRegistry != nil {
			_ = GetRegistry()
		}
	})

	t.Run("nil check before calling InitializeProviders", func(t *testing.T) {
		if InitializeProviders != nil {
			_ = InitializeProviders()
		}
	})

	t.Run("nil check before calling SetClusterContextProviders", func(t *testing.T) {
		if SetClusterContextProviders != nil {
			SetClusterContextProviders(nil, nil)
		}
	})

	t.Run("nil check before calling GetConfigManager", func(t *testing.T) {
		if GetConfigManager != nil {
			_ = GetConfigManager()
		}
	})
}

type mockError struct {
	msg string
}

func (e *mockError) Error() string {
	return e.msg
}
