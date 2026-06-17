package federation

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ────────────────────────────────────────────────────────────────────────────
// ActionDescriptor
// ────────────────────────────────────────────────────────────────────────────

func TestActionDescriptor_Fields(t *testing.T) {
	tests := []struct {
		name      string
		desc      ActionDescriptor
		wantID    string
		wantVerb  string
		wantDestr bool
	}{
		{
			name: "destructive delete",
			desc: ActionDescriptor{
				ID:          "karmada.unjoinCluster",
				Label:       "Unjoin Cluster",
				Verb:        "delete",
				Provider:    ProviderKarmada,
				Destructive: true,
			},
			wantID:    "karmada.unjoinCluster",
			wantVerb:  "delete",
			wantDestr: true,
		},
		{
			name: "non-destructive patch",
			desc: ActionDescriptor{
				ID:          "ocm.acceptCluster",
				Label:       "Accept Cluster",
				Verb:        "patch",
				Provider:    ProviderOCM,
				Destructive: false,
			},
			wantID:    "ocm.acceptCluster",
			wantVerb:  "patch",
			wantDestr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.wantID, tt.desc.ID)
			assert.Equal(t, tt.wantVerb, tt.desc.Verb)
			assert.Equal(t, tt.wantDestr, tt.desc.Destructive)
			assert.NotEmpty(t, tt.desc.Label)
			assert.NotEmpty(t, tt.desc.Provider)
		})
	}
}

func TestActionDescriptor_JSONRoundTrip(t *testing.T) {
	orig := ActionDescriptor{
		ID:          "kubeadmiral.unfederateCluster",
		Label:       "Unfederate Cluster",
		Verb:        "delete",
		Provider:    ProviderKubeAdmiral,
		Destructive: true,
	}

	data, err := json.Marshal(orig)
	require.NoError(t, err)

	var got ActionDescriptor
	require.NoError(t, json.Unmarshal(data, &got))

	assert.Equal(t, orig.ID, got.ID)
	assert.Equal(t, orig.Label, got.Label)
	assert.Equal(t, orig.Verb, got.Verb)
	assert.Equal(t, orig.Provider, got.Provider)
	assert.Equal(t, orig.Destructive, got.Destructive)
}

// ────────────────────────────────────────────────────────────────────────────
// ActionRequest
// ────────────────────────────────────────────────────────────────────────────

func TestActionRequest_JSONRoundTrip(t *testing.T) {
	orig := ActionRequest{
		ActionID:    "ocm.approveCSR",
		Provider:    ProviderOCM,
		HubContext:  "hub-cluster",
		ClusterName: "spoke-1",
		Payload: map[string]interface{}{
			"csrName": "spoke-1-csr",
		},
	}

	data, err := json.Marshal(orig)
	require.NoError(t, err)

	var got ActionRequest
	require.NoError(t, json.Unmarshal(data, &got))

	assert.Equal(t, orig.ActionID, got.ActionID)
	assert.Equal(t, orig.Provider, got.Provider)
	assert.Equal(t, orig.HubContext, got.HubContext)
	assert.Equal(t, orig.ClusterName, got.ClusterName)
	require.NotNil(t, got.Payload)
	assert.Equal(t, "spoke-1-csr", got.Payload["csrName"])
}

func TestActionRequest_OptionalFieldsOmitted(t *testing.T) {
	// ClusterName and Payload are optional (omitempty).
	req := ActionRequest{
		ActionID:   "ocm.approveCSR",
		Provider:   ProviderOCM,
		HubContext: "hub",
	}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	// omitempty fields should not appear in JSON when zero/nil
	jsonStr := string(data)
	assert.NotContains(t, jsonStr, `"clusterName"`, "empty ClusterName should be omitted")
	assert.NotContains(t, jsonStr, `"payload"`, "nil Payload should be omitted")
}

func TestActionRequest_WithPayload(t *testing.T) {
	tests := []struct {
		name        string
		payload     map[string]interface{}
		payloadKeys []string
	}{
		{
			name:        "single key payload",
			payload:     map[string]interface{}{"key": "disk-pressure", "effect": "NoSchedule"},
			payloadKeys: []string{"key", "effect"},
		},
		{
			name:        "nil payload",
			payload:     nil,
			payloadKeys: nil,
		},
		{
			name:        "empty payload",
			payload:     map[string]interface{}{},
			payloadKeys: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := ActionRequest{
				ActionID: "karmada.taintCluster",
				Provider: ProviderKarmada,
				Payload:  tt.payload,
			}
			data, err := json.Marshal(req)
			require.NoError(t, err)

			var got ActionRequest
			require.NoError(t, json.Unmarshal(data, &got))

			assert.Equal(t, len(tt.payloadKeys), len(got.Payload))
			for _, k := range tt.payloadKeys {
				assert.Contains(t, got.Payload, k)
			}
		})
	}
}

// ────────────────────────────────────────────────────────────────────────────
// ActionResult
// ────────────────────────────────────────────────────────────────────────────

func TestActionResult_States(t *testing.T) {
	tests := []struct {
		name        string
		result      ActionResult
		wantOK      bool
		wantAlready bool
	}{
		{
			name:        "success",
			result:      ActionResult{OK: true, Message: "cluster joined"},
			wantOK:      true,
			wantAlready: false,
		},
		{
			name:        "success already",
			result:      ActionResult{OK: true, Already: true, Message: "already joined"},
			wantOK:      true,
			wantAlready: true,
		},
		{
			name:        "failure",
			result:      ActionResult{OK: false, Message: "forbidden"},
			wantOK:      false,
			wantAlready: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.wantOK, tt.result.OK)
			assert.Equal(t, tt.wantAlready, tt.result.Already)
			assert.NotEmpty(t, tt.result.Message)
		})
	}
}

func TestActionResult_JSONRoundTrip(t *testing.T) {
	orig := ActionResult{
		OK:      true,
		Already: true,
		Message: "cluster already registered",
	}

	data, err := json.Marshal(orig)
	require.NoError(t, err)

	var got ActionResult
	require.NoError(t, json.Unmarshal(data, &got))

	assert.Equal(t, orig.OK, got.OK)
	assert.Equal(t, orig.Already, got.Already)
	assert.Equal(t, orig.Message, got.Message)
}

func TestActionResult_MessageOmittedWhenEmpty(t *testing.T) {
	result := ActionResult{OK: true}

	data, err := json.Marshal(result)
	require.NoError(t, err)

	// Message has omitempty in the JSON tag.
	assert.NotContains(t, string(data), `"message"`, "empty message should be omitted")
}
