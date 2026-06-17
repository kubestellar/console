package stellar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"

	"github.com/kubestellar/console/pkg/store"
)

func newMockedTaskHandlerApp(t *testing.T) (*fiber.App, *mockedStellarStore, string) {
	t.Helper()
	mockStore := newMockedStellarStore(t)
	userID := uuid.New()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	h := NewHandler(mockStore, nil)
	app.Get("/api/stellar/tasks", h.ListTasks)
	app.Post("/api/stellar/tasks", h.CreateTask)
	app.Patch("/api/stellar/tasks/status", h.UpdateTaskStatus)
	app.Patch("/api/stellar/tasks/:id/status", h.UpdateTaskStatus)

	return app, mockStore, userID.String()
}

func requestTaskHandler(t *testing.T, app *fiber.App, method, path, body string) *http.Response {
	t.Helper()

	req, err := http.NewRequest(method, path, bytes.NewReader([]byte(body)))
	require.NoError(t, err)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := app.Test(req, stellarMockedHandlerTestTimeoutMs)
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = resp.Body.Close()
	})
	return resp
}

func requestTaskHandlerRawPath(t *testing.T, app *fiber.App, method, rawPath, body string) (int, []byte) {
	t.Helper()

	var ctx fasthttp.RequestCtx
	ctx.Request.Header.SetMethod(method)
	ctx.Request.SetRequestURI(rawPath)
	if body != "" {
		ctx.Request.Header.SetContentType("application/json")
		ctx.Request.SetBodyString(body)
	}

	app.Handler()(&ctx)
	status := ctx.Response.StatusCode()
	assert.NotZero(t, status)
	return status, append([]byte(nil), ctx.Response.Body()...)
}

func requireNoStoredTasks(t *testing.T, mockStore *mockedStellarStore, userID string) {
	t.Helper()

	items, err := mockStore.SQLiteStore.GetOpenTasks(context.Background(), userID)
	require.NoError(t, err)
	require.Empty(t, items)
}

func TestListTasks(t *testing.T) {
	t.Parallel()

	type response struct {
		Items []store.StellarTask `json:"items"`
		Error string              `json:"error"`
	}

	tests := []struct {
		name       string
		items      []store.StellarTask
		storeErr   error
		wantStatus int
		assertBody func(t *testing.T, payload response)
	}{
		{
			name: "success with multiple tasks",
			items: []store.StellarTask{
				{ID: "task-1", UserID: "user-1", Title: "Investigate rollout", Status: "open", Priority: 2},
				{ID: "task-2", UserID: "user-1", Title: "Wait for approval", Status: "blocked", Priority: 4},
			},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, payload response) {
				t.Helper()
				require.Len(t, payload.Items, 2)
				assert.Equal(t, "task-1", payload.Items[0].ID)
				assert.Equal(t, "Investigate rollout", payload.Items[0].Title)
				assert.Equal(t, "open", payload.Items[0].Status)
				assert.Equal(t, "task-2", payload.Items[1].ID)
				assert.Equal(t, "Wait for approval", payload.Items[1].Title)
				assert.Equal(t, "blocked", payload.Items[1].Status)
			},
		},
		{
			name:       "success with empty list",
			items:      []store.StellarTask{},
			wantStatus: http.StatusOK,
			assertBody: func(t *testing.T, payload response) {
				t.Helper()
				assert.Empty(t, payload.Items)
			},
		},
		{
			name:       "store error",
			storeErr:   errors.New("load failed"),
			wantStatus: http.StatusInternalServerError,
			assertBody: func(t *testing.T, payload response) {
				t.Helper()
				assert.Equal(t, "failed to load tasks", payload.Error)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app, mockStore, userID := newMockedTaskHandlerApp(t)
			mockStore.On("GetOpenTasks", userID).Return(tt.items, tt.storeErr).Once()

			resp := requestTaskHandler(t, app, http.MethodGet, "/api/stellar/tasks", "")
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			var payload response
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			tt.assertBody(t, payload)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestCreateTask(t *testing.T) {
	t.Parallel()

	dueAt := time.Date(2026, time.June, 17, 23, 45, 0, 0, time.UTC)

	tests := []struct {
		name           string
		body           string
		setupMock      func(t *testing.T, mockStore *mockedStellarStore, userID string)
		wantStatus     int
		wantError      string
		assertCreated  func(t *testing.T, created store.StellarTask)
		assertNoStored bool
	}{
		{
			name: "success with minimal fields",
			body: `{"title":"  Investigate failed rollout  "}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID &&
						task.Title == "Investigate failed rollout" &&
						task.Status == "open" &&
						task.Priority == 5 &&
						task.Source == "user" &&
						task.ContextJSON == "{}" &&
						task.SessionID == "" &&
						task.Cluster == "" &&
						task.Description == "" &&
						task.ParentID == "" &&
						task.DueAt == nil
				})).Return("task-minimal", nil).Once()
			},
			wantStatus: http.StatusCreated,
			assertCreated: func(t *testing.T, created store.StellarTask) {
				t.Helper()
				assert.Equal(t, "task-minimal", created.ID)
				assert.Equal(t, "Investigate failed rollout", created.Title)
				assert.Equal(t, "open", created.Status)
				assert.Equal(t, 5, created.Priority)
				assert.Equal(t, "user", created.Source)
				assert.Equal(t, "{}", created.ContextJSON)
				assert.Nil(t, created.DueAt)
			},
		},
		{
			name: "success with all fields",
			body: `{"sessionId":" session-42 ","cluster":" prod-east ","title":"  Drain node  ","description":" cordon and drain ","priority":8,"source":" scheduler ","parentId":" parent-7 ","dueAt":"` + "2026-06-17T23:45:00Z" + `","contextJson":" {\"step\":\"drain\"} "}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID &&
						task.SessionID == "session-42" &&
						task.Cluster == "prod-east" &&
						task.Title == "Drain node" &&
						task.Description == "cordon and drain" &&
						task.Status == "open" &&
						task.Priority == 8 &&
						task.Source == "scheduler" &&
						task.ParentID == "parent-7" &&
						task.ContextJSON == "{\"step\":\"drain\"}" &&
						task.DueAt != nil &&
						task.DueAt.Equal(dueAt)
				})).Return("task-all-fields", nil).Once()
			},
			wantStatus: http.StatusCreated,
			assertCreated: func(t *testing.T, created store.StellarTask) {
				t.Helper()
				assert.Equal(t, "task-all-fields", created.ID)
				assert.Equal(t, "session-42", created.SessionID)
				assert.Equal(t, "prod-east", created.Cluster)
				assert.Equal(t, "Drain node", created.Title)
				assert.Equal(t, "cordon and drain", created.Description)
				assert.Equal(t, 8, created.Priority)
				assert.Equal(t, "scheduler", created.Source)
				assert.Equal(t, "parent-7", created.ParentID)
				assert.Equal(t, "{\"step\":\"drain\"}", created.ContextJSON)
				require.NotNil(t, created.DueAt)
				assert.True(t, created.DueAt.Equal(dueAt))
			},
		},
		{
			name: "priority defaults to 5 when out of range",
			body: `{"title":"Normalize priority","priority":42}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID && task.Title == "Normalize priority" && task.Priority == 5
				})).Return("task-priority", nil).Once()
			},
			wantStatus: http.StatusCreated,
			assertCreated: func(t *testing.T, created store.StellarTask) {
				t.Helper()
				assert.Equal(t, 5, created.Priority)
			},
		},
		{
			name: "source defaults to user when empty",
			body: `{"title":"Default source","source":"   "}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID && task.Title == "Default source" && task.Source == "user"
				})).Return("task-source", nil).Once()
			},
			wantStatus: http.StatusCreated,
			assertCreated: func(t *testing.T, created store.StellarTask) {
				t.Helper()
				assert.Equal(t, "user", created.Source)
			},
		},
		{
			name: "contextJson defaults to empty object when empty",
			body: `{"title":"Default context","contextJson":"   "}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID && task.Title == "Default context" && task.ContextJSON == "{}"
				})).Return("task-context", nil).Once()
			},
			wantStatus: http.StatusCreated,
			assertCreated: func(t *testing.T, created store.StellarTask) {
				t.Helper()
				assert.Equal(t, "{}", created.ContextJSON)
			},
		},
		{
			name:           "missing title returns bad request",
			body:           `{}`,
			wantStatus:     http.StatusBadRequest,
			wantError:      "title is required",
			assertNoStored: true,
		},
		{
			name:           "whitespace only title returns bad request",
			body:           `{"title":"   "}`,
			wantStatus:     http.StatusBadRequest,
			wantError:      "title is required",
			assertNoStored: true,
		},
		{
			name:           "invalid RFC3339 dueAt returns bad request",
			body:           `{"title":"Bad due at","dueAt":"not-rfc3339"}`,
			wantStatus:     http.StatusBadRequest,
			wantError:      "dueAt must be RFC3339",
			assertNoStored: true,
		},
		{
			name: "store error returns internal server error",
			body: `{"title":"Persist me"}`,
			setupMock: func(t *testing.T, mockStore *mockedStellarStore, userID string) {
				t.Helper()
				mockStore.On("CreateTask", mock.MatchedBy(func(task *store.StellarTask) bool {
					return task.UserID == userID && task.Title == "Persist me"
				})).Return("", errors.New("insert failed")).Once()
			},
			wantStatus: http.StatusInternalServerError,
			wantError:  "failed to create task",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app, mockStore, userID := newMockedTaskHandlerApp(t)
			if tt.setupMock != nil {
				tt.setupMock(t, mockStore, userID)
			}

			resp := requestTaskHandler(t, app, http.MethodPost, "/api/stellar/tasks", tt.body)
			require.Equal(t, tt.wantStatus, resp.StatusCode)

			if tt.wantStatus == http.StatusCreated {
				var created store.StellarTask
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
				tt.assertCreated(t, created)
			} else {
				var payload struct {
					Error string `json:"error"`
				}
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
				assert.Equal(t, tt.wantError, payload.Error)
			}

			if tt.assertNoStored {
				requireNoStoredTasks(t, mockStore, userID)
			}
			mockStore.AssertExpectations(t)
		})
	}
}

func TestUpdateTaskStatus(t *testing.T) {
	t.Parallel()

	type response struct {
		ID     string              `json:"id"`
		Status string              `json:"status"`
		Items  []store.StellarTask `json:"items"`
		Error  string              `json:"error"`
	}

	successCases := []struct {
		name           string
		requestStatus  string
		expectedStatus string
	}{
		{name: "open status", requestStatus: "OPEN", expectedStatus: "open"},
		{name: "in progress status", requestStatus: "IN_PROGRESS", expectedStatus: "in_progress"},
		{name: "blocked status", requestStatus: "BLOCKED", expectedStatus: "blocked"},
		{name: "done status", requestStatus: "DONE", expectedStatus: "done"},
		{name: "dismissed status", requestStatus: "DISMISSED", expectedStatus: "dismissed"},
	}

	for _, tt := range successCases {
		t.Run("success "+tt.name, func(t *testing.T) {
			t.Parallel()

			app, mockStore, userID := newMockedTaskHandlerApp(t)
			openItems := []store.StellarTask{{ID: "task-open", UserID: userID, Title: "Keep watching", Status: "open"}}
			mockStore.On("UpdateTaskStatus", "task-7", tt.expectedStatus, userID).Return(nil).Once()
			mockStore.On("GetOpenTasks", userID).Return(openItems, nil).Once()

			resp := requestTaskHandler(t, app, http.MethodPatch, "/api/stellar/tasks/task-7/status", `{"status":"`+tt.requestStatus+`"}`)
			require.Equal(t, http.StatusOK, resp.StatusCode)

			var payload response
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "task-7", payload.ID)
			assert.Equal(t, tt.expectedStatus, payload.Status)
			require.Len(t, payload.Items, 1)
			assert.Equal(t, "task-open", payload.Items[0].ID)
			mockStore.AssertExpectations(t)
		})
	}

	errorCases := []struct {
		name       string
		path       string
		body       string
		rawPath    bool
		setupMock  func(mockStore *mockedStellarStore, userID string)
		wantStatus int
		wantError  string
	}{
		{
			name:       "empty task ID returns bad request",
			path:       "/api/stellar/tasks/status",
			body:       `{"status":"open"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "id is required",
		},
		{
			name:       "whitespace task ID returns bad request",
			path:       "/api/stellar/tasks/   /status",
			body:       `{"status":"open"}`,
			rawPath:    true,
			wantStatus: http.StatusBadRequest,
			wantError:  "id is required",
		},
		{
			name:       "invalid status returns bad request",
			path:       "/api/stellar/tasks/task-7/status",
			body:       `{"status":"paused"}`,
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid status",
		},
		{
			name: "store error returns internal server error",
			path: "/api/stellar/tasks/task-7/status",
			body: `{"status":"done"}`,
			setupMock: func(mockStore *mockedStellarStore, userID string) {
				mockStore.On("UpdateTaskStatus", "task-7", "done", userID).Return(errors.New("update failed")).Once()
			},
			wantStatus: http.StatusInternalServerError,
			wantError:  "failed to update task status",
		},
	}

	for _, tt := range errorCases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app, mockStore, userID := newMockedTaskHandlerApp(t)
			if tt.setupMock != nil {
				tt.setupMock(mockStore, userID)
			}

			var payload response
			if tt.rawPath {
				status, body := requestTaskHandlerRawPath(t, app, http.MethodPatch, tt.path, tt.body)
				require.Equal(t, tt.wantStatus, status)
				require.NoError(t, json.Unmarshal(body, &payload))
			} else {
				resp := requestTaskHandler(t, app, http.MethodPatch, tt.path, tt.body)
				require.Equal(t, tt.wantStatus, resp.StatusCode)
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			}
			assert.Equal(t, tt.wantError, payload.Error)
			mockStore.AssertExpectations(t)
		})
	}
}

func TestTaskStatusValidation(t *testing.T) {
	t.Parallel()

	validStatuses := []string{"open", "in_progress", "blocked", "done", "dismissed"}

	for _, status := range validStatuses {
		t.Run(status, func(t *testing.T) {
			t.Parallel()

			app, mockStore, userID := newMockedTaskHandlerApp(t)
			mockStore.On("UpdateTaskStatus", "task-9", status, userID).Return(errors.New("store reached")).Once()

			resp := requestTaskHandler(t, app, http.MethodPatch, "/api/stellar/tasks/task-9/status", `{"status":"`+status+`"}`)
			require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

			var payload struct {
				Error string `json:"error"`
			}
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
			assert.Equal(t, "failed to update task status", payload.Error)
			mockStore.AssertExpectations(t)
		})
	}
}
