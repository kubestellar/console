package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
)

const testUserID = "00000000-0000-0000-0000-000000000001"

// MockK8sClient is a mock implementation of k8s.K8sClient for persistence tests
type MockK8sClient struct {
	mock.Mock
}

func (m *MockK8sClient) ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]k8s.ClusterInfo), args.Error(1)
}

func (m *MockK8sClient) GetDynamicClient(clusterName string) (dynamic.Interface, error) {
	args := m.Called(clusterName)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(dynamic.Interface), args.Error(1)
}

func (m *MockK8sClient) GetRestConfig(clusterName string) (*rest.Config, error) {
	args := m.Called(clusterName)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*rest.Config), args.Error(1)
}

func (m *MockK8sClient) ListNamespaces(ctx context.Context, cluster string) ([]k8s.NamespaceInfo, error) {
	return nil, nil
}

func (m *MockK8sClient) ListPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error) {
	return nil, nil
}

func (m *MockK8sClient) ListNodes(ctx context.Context, cluster string) ([]k8s.NodeInfo, error) {
	return nil, nil
}

func (m *MockK8sClient) GetClusterHealth(ctx context.Context, cluster string) (*k8s.ClusterHealth, error) {
	return nil, nil
}

func (m *MockK8sClient) DeployWorkload(ctx context.Context, sourceCluster, sourceNamespace, workloadName string, targets []string, replicas int32, opts *k8s.DeployOptions) (*k8s.DeployResult, error) {
	return nil, nil
}

// MockPersistenceStore is a mock implementation of store.PersistenceStore
type MockPersistenceStore struct {
	mock.Mock
}

func (m *MockPersistenceStore) IsEnabled() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockPersistenceStore) GetActiveCluster(ctx context.Context) (string, error) {
	args := m.Called(ctx)
	return args.String(0), args.Error(1)
}

func (m *MockPersistenceStore) GetNamespace() string {
	args := m.Called()
	return args.String(0)
}

func (m *MockPersistenceStore) GetActiveClient(ctx context.Context) (dynamic.Interface, *rest.Config, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, nil, args.Error(2)
	}
	if args.Get(1) == nil {
		return args.Get(0).(dynamic.Interface), nil, args.Error(2)
	}
	return args.Get(0).(dynamic.Interface), args.Get(1).(*rest.Config), args.Error(2)
}

func TestRequireAdmin(t *testing.T) {
	tests := []struct {
		name          string
		setupUserID   bool
		userStoreNil  bool
		mockUser      *models.User
		mockError     error
		expectedCode  int
		expectedError string
	}{
		{
			name:         "NoUserStore_SkipCheck",
			userStoreNil: true,
			setupUserID:  true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "AdminUser_Allowed",
			setupUserID:  true,
			mockUser:     &models.User{ID: uuid.MustParse(testUserID), Role: models.UserRoleAdmin},
			mockError:    nil,
			expectedCode: http.StatusOK,
		},
		{
			name:          "ViewerUser_Forbidden",
			setupUserID:   true,
			mockUser:      &models.User{ID: uuid.MustParse(testUserID), Role: models.UserRoleViewer},
			mockError:     nil,
			expectedCode:  http.StatusForbidden,
			expectedError: "Console admin access required",
		},
		{
			name:          "NilUser_Forbidden",
			setupUserID:   true,
			mockUser:      nil,
			mockError:     nil,
			expectedCode:  http.StatusForbidden,
			expectedError: "Console admin access required",
		},
		{
			name:          "DBError_InternalServerError",
			setupUserID:   true,
			mockError:     errors.New("database connection failed"),
			expectedCode:  http.StatusInternalServerError,
			expectedError: "Failed to verify admin role",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			var mockStore *test.MockStore
			var h *ConsolePersistenceHandlers

			if tt.userStoreNil {
				h = &ConsolePersistenceHandlers{}
			} else {
				mockStore = new(test.MockStore)
				userID := uuid.MustParse(testUserID)
				mockStore.On("GetUser", userID).Return(tt.mockUser, tt.mockError).Once()
				h = &ConsolePersistenceHandlers{userStore: mockStore}
			}

			app.Get("/test", func(c *fiber.Ctx) error {
				if tt.setupUserID {
					c.Locals("userID", uuid.MustParse(testUserID))
				}
				err := h.RequireAdmin(c)
				if err != nil {
					return err
				}
				return c.SendStatus(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.expectedCode, resp.StatusCode)

			if !tt.userStoreNil && mockStore != nil {
				mockStore.AssertExpectations(t)
			}
		})
	}
}

func TestCheckClusterHealth(t *testing.T) {
	tests := []struct {
		name           string
		clusterName    string
		k8sClientNil   bool
		mockClusters   []k8s.ClusterInfo
		mockError      error
		expectedHealth store.ClusterHealth
	}{
		{
			name:           "NoK8sClient_ReturnsUnknown",
			clusterName:    "test-cluster",
			k8sClientNil:   true,
			expectedHealth: store.ClusterHealthUnknown,
		},
		{
			name:        "HealthyCluster_ReturnsHealthy",
			clusterName: "healthy-cluster",
			mockClusters: []k8s.ClusterInfo{
				{Name: "healthy-cluster", Healthy: true},
			},
			expectedHealth: store.ClusterHealthHealthy,
		},
		{
			name:        "UnhealthyCluster_ReturnsUnreachable",
			clusterName: "unhealthy-cluster",
			mockClusters: []k8s.ClusterInfo{
				{Name: "unhealthy-cluster", Healthy: false},
			},
			expectedHealth: store.ClusterHealthUnreachable,
		},
		{
			name:        "ClusterNotFound_ReturnsUnknown",
			clusterName: "nonexistent-cluster",
			mockClusters: []k8s.ClusterInfo{
				{Name: "other-cluster", Healthy: true},
			},
			expectedHealth: store.ClusterHealthUnknown,
		},
		{
			name:           "ListClustersError_ReturnsUnknown",
			clusterName:    "test-cluster",
			mockError:      errors.New("failed to list clusters"),
			expectedHealth: store.ClusterHealthUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			var h *ConsolePersistenceHandlers

			if tt.k8sClientNil {
				h = &ConsolePersistenceHandlers{}
			} else {
				mockK8s := new(MockK8sClient)
				mockK8s.On("ListClusters", ctx).Return(tt.mockClusters, tt.mockError).Once()
				h = &ConsolePersistenceHandlers{k8sClient: mockK8s}
			}

			health := h.checkClusterHealth(ctx, tt.clusterName)
			assert.Equal(t, tt.expectedHealth, health)

			if !tt.k8sClientNil && h.k8sClient != nil {
				mockK8s := h.k8sClient.(*MockK8sClient)
				mockK8s.AssertExpectations(t)
			}
		})
	}
}

func TestGetClusterClient(t *testing.T) {
	tests := []struct {
		name          string
		clusterName   string
		k8sClientNil  bool
		mockClient    dynamic.Interface
		mockConfig    *rest.Config
		clientError   error
		configError   error
		expectError   bool
		errorContains string
	}{
		{
			name:          "NoK8sClient_ReturnsError",
			clusterName:   "test-cluster",
			k8sClientNil:  true,
			expectError:   true,
			errorContains: noClusterAccessMsg,
		},
		{
			name:        "Success_ReturnsBoth",
			clusterName: "prod-cluster",
			mockClient:  fake.NewSimpleDynamicClient(scheme.Scheme),
			mockConfig:  &rest.Config{Host: "https://prod-api:6443"},
			expectError: false,
		},
		{
			name:          "ClientError_ReturnsError",
			clusterName:   "error-cluster",
			clientError:   errors.New("failed to create client"),
			expectError:   true,
			errorContains: "failed to create client",
		},
		{
			name:          "ConfigError_ReturnsError",
			clusterName:   "config-error-cluster",
			mockClient:    fake.NewSimpleDynamicClient(scheme.Scheme),
			configError:   errors.New("failed to get config"),
			expectError:   true,
			errorContains: "failed to get rest config",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var h *ConsolePersistenceHandlers

			if tt.k8sClientNil {
				h = &ConsolePersistenceHandlers{}
			} else {
				mockK8s := new(MockK8sClient)
				mockK8s.On("GetDynamicClient", tt.clusterName).Return(tt.mockClient, tt.clientError).Maybe()
				if tt.clientError == nil {
					mockK8s.On("GetRestConfig", tt.clusterName).Return(tt.mockConfig, tt.configError).Once()
				}
				h = &ConsolePersistenceHandlers{k8sClient: mockK8s}
			}

			client, config, err := h.getClusterClient(tt.clusterName)

			if tt.expectError {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorContains)
				assert.Nil(t, client)
				assert.Nil(t, config)
			} else {
				require.NoError(t, err)
				assert.NotNil(t, client)
				assert.NotNil(t, config)
				assert.Equal(t, tt.mockConfig, config)
			}

			if !tt.k8sClientNil && h.k8sClient != nil {
				mockK8s := h.k8sClient.(*MockK8sClient)
				mockK8s.AssertExpectations(t)
			}
		})
	}
}

func TestStopWatcher(t *testing.T) {
	t.Run("stop watcher when watcher is nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		assert.NotPanics(t, func() {
			h.StopWatcher()
		})
	})

	t.Run("stop watcher sets watcher to nil", func(t *testing.T) {
		h := &ConsolePersistenceHandlers{}
		h.watcher = nil
		h.StopWatcher()
		assert.Nil(t, h.watcher)
	})
}
