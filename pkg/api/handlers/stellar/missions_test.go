package stellar

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

func Test_parseMissionPayload(t *testing.T) {
	tests := []struct {
		name    string
		body    map[string]interface{}
		wantErr bool
		errHint string
		checks  func(t *testing.T, mission interface{})
	}{
		{
			name: "valid mission with all fields",
			body: map[string]interface{}{
				"name":           "overnight-watch",
				"goal":           "Watch production overnight",
				"schedule":       "0 1 * * *",
				"triggerType":    "cron",
				"providerPolicy": "hybrid-fallback",
				"memoryScope":    "mission",
				"enabled":        true,
				"toolBindings":   []string{"kubernetes", "prometheus"},
			},
			wantErr: false,
			checks: func(t *testing.T, mission interface{}) {
				m := mission.(map[string]interface{})
				assert.Equal(t, "overnight-watch", m["name"])
				assert.Equal(t, "cron", m["triggerType"])
				assert.Equal(t, true, m["enabled"])
				assert.Len(t, m["toolBindings"], 2)
			},
		},
		{
			name: "valid mission with defaults",
			body: map[string]interface{}{
				"name": "test-mission",
				"goal": "Test goal",
			},
			wantErr: false,
			checks: func(t *testing.T, mission interface{}) {
				m := mission.(map[string]interface{})
				assert.Equal(t, "manual", m["triggerType"])
				assert.Equal(t, "auto", m["providerPolicy"])
				assert.Equal(t, "user", m["memoryScope"])
			},
		},
		{
			name: "empty name",
			body: map[string]interface{}{
				"name": "",
				"goal": "Test goal",
			},
			wantErr: true,
			errHint: "name is required",
		},
		{
			name: "whitespace-only name",
			body: map[string]interface{}{
				"name": "   ",
				"goal": "Test goal",
			},
			wantErr: true,
			errHint: "name is required",
		},
		{
			name: "name too long",
			body: map[string]interface{}{
				"name": string(make([]byte, stellarMaxNameLength+1)),
				"goal": "Test goal",
			},
			wantErr: true,
			errHint: "name is required",
		},
		{
			name: "empty goal",
			body: map[string]interface{}{
				"name": "test",
				"goal": "",
			},
			wantErr: true,
			errHint: "goal is required",
		},
		{
			name: "goal too long",
			body: map[string]interface{}{
				"name": "test",
				"goal": string(make([]byte, stellarMaxGoalLength+1)),
			},
			wantErr: true,
			errHint: "goal is required",
		},
		{
			name: "schedule too long",
			body: map[string]interface{}{
				"name":     "test",
				"goal":     "Test goal",
				"schedule": string(make([]byte, stellarMaxScheduleLength+1)),
			},
			wantErr: true,
			errHint: "schedule must be",
		},
		{
			name: "invalid trigger type",
			body: map[string]interface{}{
				"name":        "test",
				"goal":        "Test goal",
				"triggerType": "invalid-trigger",
			},
			wantErr: true,
			errHint: "invalid triggerType",
		},
		{
			name: "too many tool bindings",
			body: map[string]interface{}{
				"name":         "test",
				"goal":         "Test goal",
				"toolBindings": make([]string, stellarMaxToolsPerMission+1),
			},
			wantErr: true,
			errHint: "too many toolBindings",
		},
		{
			name: "tool binding name too long",
			body: map[string]interface{}{
				"name": "test",
				"goal": "Test goal",
				"toolBindings": []string{
					string(make([]byte, stellarMaxToolNameLength+1)),
				},
			},
			wantErr: true,
			errHint: "tool name too long",
		},
		{
			name: "filters empty tool binding names",
			body: map[string]interface{}{
				"name":         "test",
				"goal":         "Test goal",
				"toolBindings": []string{"kubectl", "", "  ", "prometheus"},
			},
			wantErr: false,
			checks: func(t *testing.T, mission interface{}) {
				m := mission.(map[string]interface{})
				tools := m["toolBindings"].([]interface{})
				assert.Len(t, tools, 2)
				assert.Equal(t, "kubectl", tools[0])
				assert.Equal(t, "prometheus", tools[1])
			},
		},
		{
			name: "trims whitespace from fields",
			body: map[string]interface{}{
				"name":           "  test-mission  ",
				"goal":           "  Test goal  ",
				"schedule":       "  0 1 * * *  ",
				"triggerType":    "  cron  ",
				"providerPolicy": "  auto  ",
				"memoryScope":    "  user  ",
			},
			wantErr: false,
			checks: func(t *testing.T, mission interface{}) {
				m := mission.(map[string]interface{})
				assert.Equal(t, "test-mission", m["name"])
				assert.Equal(t, "Test goal", m["goal"])
				assert.Equal(t, "0 1 * * *", m["schedule"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			jsonBody, _ := json.Marshal(tt.body)

			req, err := http.NewRequest(http.MethodPost, "/test", bytes.NewReader(jsonBody))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")

			c := app.AcquireCtx(&fasthttp.RequestCtx{})
			defer app.ReleaseCtx(c)
			c.Request().SetBody(jsonBody)
			c.Request().Header.SetContentType("application/json")

			mission, err := parseMissionPayload(c)

			if tt.wantErr {
				require.Error(t, err)
				if tt.errHint != "" {
					assert.Contains(t, err.Error(), tt.errHint)
				}
				return
			}

			require.NoError(t, err)
			require.NotNil(t, mission)

			if tt.checks != nil {
				missionMap := map[string]interface{}{
					"name":           mission.Name,
					"goal":           mission.Goal,
					"schedule":       mission.Schedule,
					"triggerType":    mission.TriggerType,
					"providerPolicy": mission.ProviderPolicy,
					"memoryScope":    mission.MemoryScope,
					"enabled":        mission.Enabled,
					"toolBindings":   mission.ToolBindings,
				}
				tt.checks(t, missionMap)
			}
		})
	}
}

func Test_parseMissionPayload_InvalidJSON(t *testing.T) {
	app := fiber.New()
	c := app.AcquireCtx(&fasthttp.RequestCtx{})
	defer app.ReleaseCtx(c)

	c.Request().SetBody([]byte("invalid json"))
	c.Request().Header.SetContentType("application/json")

	_, err := parseMissionPayload(c)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid JSON body")
}
