package providers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"k8s.io/client-go/rest"
)

type testKubeAPIServer struct {
	t        *testing.T
	mu       sync.Mutex
	objects  map[string]map[string]interface{}
	statuses map[string]int
}

func newTestKubeAPIServer(t *testing.T, objects map[string]map[string]interface{}, statuses map[string]int) (*httptest.Server, *rest.Config, *testKubeAPIServer) {
	t.Helper()

	state := &testKubeAPIServer{
		t:        t,
		objects:  make(map[string]map[string]interface{}, len(objects)),
		statuses: statuses,
	}
	for path, obj := range objects {
		state.objects[path] = deepCopyMap(t, obj)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		state.handle(w, r)
	}))

	return server, &rest.Config{
		Host: server.URL,
		ContentConfig: rest.ContentConfig{
			ContentType:        "application/json",
			AcceptContentTypes: "application/json",
		},
	}, state
}

func (s *testKubeAPIServer) handle(w http.ResponseWriter, r *http.Request) {
	s.t.Helper()
	w.Header().Set("Content-Type", "application/json")

	if status, ok := s.statuses[r.Method+" "+r.URL.Path]; ok {
		writeStatusResponse(w, status, r.URL.Path)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	switch r.Method {
	case http.MethodGet:
		obj, ok := s.objects[r.URL.Path]
		if !ok {
			writeStatusResponse(w, http.StatusNotFound, r.URL.Path)
			return
		}
		_ = json.NewEncoder(w).Encode(obj)
	case http.MethodPost:
		var obj map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
			writeStatusResponse(w, http.StatusBadRequest, r.URL.Path)
			return
		}
		name := nestedString(obj, "metadata", "name")
		if name == "" {
			writeStatusResponse(w, http.StatusBadRequest, r.URL.Path)
			return
		}
		objectPath := strings.TrimSuffix(r.URL.Path, "/") + "/" + name
		if _, exists := s.objects[objectPath]; exists {
			writeStatusResponse(w, http.StatusConflict, objectPath)
			return
		}
		s.objects[objectPath] = obj
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(obj)
	case http.MethodPatch:
		current, ok := s.objects[r.URL.Path]
		if !ok {
			writeStatusResponse(w, http.StatusNotFound, r.URL.Path)
			return
		}
		var patch map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeStatusResponse(w, http.StatusBadRequest, r.URL.Path)
			return
		}
		mergeMaps(current, patch)
		s.objects[r.URL.Path] = current
		_ = json.NewEncoder(w).Encode(current)
	case http.MethodDelete:
		if _, ok := s.objects[r.URL.Path]; !ok {
			writeStatusResponse(w, http.StatusNotFound, r.URL.Path)
			return
		}
		delete(s.objects, r.URL.Path)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"kind": "Status", "status": "Success", "code": http.StatusOK})
	case http.MethodPut:
		basePath := strings.TrimSuffix(r.URL.Path, "/approval")
		if _, ok := s.objects[basePath]; !ok {
			writeStatusResponse(w, http.StatusNotFound, basePath)
			return
		}
		var obj map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
			writeStatusResponse(w, http.StatusBadRequest, r.URL.Path)
			return
		}
		s.objects[basePath] = obj
		_ = json.NewEncoder(w).Encode(obj)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *testKubeAPIServer) object(path string) map[string]interface{} {
	s.t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()

	obj, ok := s.objects[path]
	if !ok {
		return nil
	}
	return deepCopyMap(s.t, obj)
}

func writeStatusResponse(w http.ResponseWriter, code int, path string) {
	reason := "Unknown"
	message := "request failed"
	switch code {
	case http.StatusNotFound:
		reason = "NotFound"
		message = "404 not found"
	case http.StatusConflict:
		reason = "Conflict"
		message = "the object has been modified"
	case http.StatusBadRequest:
		reason = "BadRequest"
		message = "bad request"
	}
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"kind":    "Status",
		"status":  "Failure",
		"message": message + ": " + path,
		"reason":  reason,
		"code":    code,
	})
}

func mergeMaps(dst, patch map[string]interface{}) {
	if dst == nil || patch == nil {
		return
	}
	for key, value := range patch {
		patchMap, patchIsMap := value.(map[string]interface{})
		dstMap, dstIsMap := dst[key].(map[string]interface{})
		if patchIsMap && dstIsMap {
			mergeMaps(dstMap, patchMap)
			continue
		}
		dst[key] = value
	}
}

func deepCopyMap(t *testing.T, src map[string]interface{}) map[string]interface{} {
	t.Helper()
	data, err := json.Marshal(src)
	if err != nil {
		t.Fatalf("marshal deep copy: %v", err)
	}
	var out map[string]interface{}
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("unmarshal deep copy: %v", err)
	}
	return out
}

func nestedString(obj map[string]interface{}, fields ...string) string {
	current := obj
	for i, field := range fields {
		value, ok := current[field]
		if !ok {
			return ""
		}
		if i == len(fields)-1 {
			str, _ := value.(string)
			return str
		}
		next, ok := value.(map[string]interface{})
		if !ok {
			return ""
		}
		current = next
	}
	return ""
}
