package httputil

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsValidK8sName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{name: "single char", input: "a", want: true},
		{name: "dotted group", input: "keda.sh", want: true},
		{name: "hyphenated", input: "my-cluster-1", want: true},
		{name: "empty", input: "", want: false},
		{name: "uppercase", input: "MyCluster", want: false},
		{name: "leading hyphen", input: "-flag", want: false},
		{name: "trailing dot", input: "abc.", want: false},
		{name: "shell metachar", input: "a;rm", want: false},
		{name: "max length", input: strings.Repeat("a", MaxK8sNameLen), want: true},
		{name: "over max length", input: strings.Repeat("a", MaxK8sNameLen+1), want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, IsValidK8sName(tt.input))
		})
	}
}

func TestValidateK8sName(t *testing.T) {
	tests := []struct {
		name    string
		param   string
		value   string
		wantErr bool
	}{
		{name: "empty allowed", param: "cluster", value: "", wantErr: false},
		{name: "valid", param: "cluster", value: "prod-east", wantErr: false},
		{name: "invalid", param: "namespace", value: "Bad_NS", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateK8sName(tt.param, tt.value)
			if !tt.wantErr {
				assert.NoError(t, err)
				return
			}
			var fe *fiber.Error
			require.True(t, errors.As(err, &fe))
			assert.Equal(t, fiber.StatusBadRequest, fe.Code)
			assert.Contains(t, fe.Message, "invalid "+tt.param)
		})
	}
}

func TestValidateClusterAndNamespace(t *testing.T) {
	tests := []struct {
		name      string
		cluster   string
		namespace string
		wantParam string
	}{
		{name: "both valid", cluster: "c1", namespace: "ns1"},
		{name: "both empty", cluster: "", namespace: ""},
		{name: "bad cluster", cluster: "C!", namespace: "ns1", wantParam: "cluster"},
		{name: "bad namespace", cluster: "c1", namespace: "N!", wantParam: "namespace"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateClusterAndNamespace(tt.cluster, tt.namespace)
			if tt.wantParam == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), "invalid "+tt.wantParam)
		})
	}
}

func TestErrNoClusterAccess(t *testing.T) {
	app := fiber.New()
	app.Get("/", ErrNoClusterAccess)

	resp, err := app.Test(httptest.NewRequest("GET", "/", nil))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, NoClusterAccessMsg, body["error"])
}
