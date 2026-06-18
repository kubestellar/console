package kube

import (
	"bytes"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	progressValidating = 10
	progressCreating   = 30
	progressDeleting   = 30
	progressConnecting = 50
	progressDone       = 100
	progressFailed     = 0
)

const (
	vclusterListTimeout    = 15 * time.Second
	vclusterCreateTimeout  = 120 * time.Second
	vclusterConnectTimeout = 30 * time.Second
	vclusterDeleteTimeout  = 60 * time.Second
)

var (
	lookPath                  = exec.LookPath
	statFile                  = os.Stat
	userHomeDir               = os.UserHomeDir
	standardToolCandidates    = defaultStandardToolCandidates
	k3dVersionRegexp          = regexp.MustCompile(`v([\d.]+)`)
	minikubeProfileNameRegexp = regexp.MustCompile(`"Name":\s*"([^"]+)"`)
	vclusterVersionRegexp     = regexp.MustCompile(`v?([\d.]+)`)
	semverRegexp              = regexp.MustCompile(`v?([\d]+\.[\d]+\.[\d]+)`)
	dns1123LabelRegexp        = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
)

type LocalClusterTool struct {
	Name      string `json:"name"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Path      string `json:"path,omitempty"`
}

type LocalCluster struct {
	Name   string `json:"name"`
	Tool   string `json:"tool"`
	Status string `json:"status"`
}

type VClusterInstance struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Connected bool   `json:"connected"`
	Context   string `json:"context"`
}

type vclusterListEntry struct {
	Name      string `json:"Name"`
	Namespace string `json:"Namespace"`
	Status    string `json:"Status"`
	Connected bool   `json:"Connected"`
	Context   string `json:"Context"`
}

type LocalClusterManager struct {
	broadcast func(msgType string, payload interface{})
}

func NewLocalClusterManager(broadcast func(string, interface{})) *LocalClusterManager {
	return &LocalClusterManager{broadcast: broadcast}
}

func (m *LocalClusterManager) broadcastProgress(tool, name, status, message string, progress int) {
	if m.broadcast == nil {
		slog.Debug("[LocalCluster] no broadcast listener, progress event dropped", "tool", tool, "name", name, "status", status, "progress", progress)
		return
	}
	m.broadcast("local_cluster_progress", map[string]interface{}{"tool": tool, "name": name, "status": status, "message": message, "progress": progress})
}

func (m *LocalClusterManager) checkDockerRunning() error {
	cmd := execCommand("docker", "info")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("Docker is not running. Start Docker Desktop or Rancher Desktop first. (%s)", strings.TrimSpace(stderr.String()))
	}
	return nil
}

func isExecutableTool(info os.FileInfo) bool {
	if info == nil || info.IsDir() {
		return false
	}
	if runtime.GOOS == "windows" {
		return true
	}
	return info.Mode()&0o111 != 0
}

func defaultStandardToolCandidates(name string) []string {
	candidateNames := []string{name}
	if runtime.GOOS == "windows" && filepath.Ext(name) == "" {
		candidateNames = append(candidateNames, name+".exe", name+".cmd", name+".bat")
	}

	dirs := make([]string, 0, 8)
	if home, err := userHomeDir(); err == nil && home != "" {
		if runtime.GOOS == "windows" {
			dirs = append(dirs, filepath.Join(home, "scoop", "shims"))
		} else {
			dirs = append(dirs, filepath.Join(home, ".local", "bin"), filepath.Join(home, "bin"))
		}
	}

	switch runtime.GOOS {
	case "darwin":
		dirs = append(dirs, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin")
	case "windows":
		programFiles := os.Getenv("ProgramFiles")
		localAppData := os.Getenv("LOCALAPPDATA")
		if programFiles != "" {
			dirs = append(dirs, filepath.Join(programFiles, "Helm"), filepath.Join(programFiles, "Kubernetes"))
		}
		if localAppData != "" {
			dirs = append(dirs, filepath.Join(localAppData, "Microsoft", "WinGet", "Links"))
		}
	default:
		dirs = append(dirs, "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin", "/usr/bin", "/snap/bin")
	}

	candidates := make([]string, 0, len(dirs)*len(candidateNames))
	seen := make(map[string]struct{}, len(dirs)*len(candidateNames))
	for _, dir := range dirs {
		if dir == "" {
			continue
		}
		for _, candidateName := range candidateNames {
			candidate := filepath.Join(dir, candidateName)
			if _, exists := seen[candidate]; exists {
				continue
			}
			seen[candidate] = struct{}{}
			candidates = append(candidates, candidate)
		}
	}
	return candidates
}

func findExecutablePath(name string) (string, error) {
	if path, err := lookPath(name); err == nil {
		return path, nil
	}
	for _, candidate := range standardToolCandidates(name) {
		info, err := statFile(candidate)
		if err != nil {
			continue
		}
		if isExecutableTool(info) {
			return candidate, nil
		}
	}
	return "", &exec.Error{Name: name, Err: exec.ErrNotFound}
}

func (m *LocalClusterManager) detectNamedTool(name string) *LocalClusterTool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "kind":
		return m.detectKind()
	case "k3d":
		return m.detectK3d()
	case "minikube":
		return m.detectMinikube()
	case "vcluster":
		return m.detectVCluster()
	default:
		path, err := findExecutablePath(name)
		if err != nil {
			return nil
		}
		return &LocalClusterTool{Name: strings.ToLower(strings.TrimSpace(name)), Installed: true, Path: path}
	}
}

func (m *LocalClusterManager) DetectTools() []LocalClusterTool {
	allTools := m.DetectNamedTools([]string{"kind", "k3d", "minikube", "vcluster"})
	tools := make([]LocalClusterTool, 0, len(allTools))
	for _, tool := range allTools {
		if tool.Installed {
			tools = append(tools, tool)
		}
	}
	return tools
}

func (m *LocalClusterManager) DetectNamedTools(names []string) []LocalClusterTool {
	tools := make([]LocalClusterTool, 0, len(names))
	seen := make(map[string]struct{}, len(names))
	for _, name := range names {
		normalized := strings.ToLower(strings.TrimSpace(name))
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		if tool := m.detectNamedTool(normalized); tool != nil {
			tools = append(tools, *tool)
			continue
		}
		tools = append(tools, LocalClusterTool{Name: normalized, Installed: false})
	}
	return tools
}

func (m *LocalClusterManager) ListClusters() []LocalCluster {
	clusters := make([]LocalCluster, 0)
	clusters = append(clusters, m.listKindClusters()...)
	clusters = append(clusters, m.listK3dClusters()...)
	clusters = append(clusters, m.listMinikubeClusters()...)
	return clusters
}

func validateClusterName(name string) error {
	if name == "" {
		return fmt.Errorf("cluster name must not be empty")
	}
	if !dns1123LabelRegexp.MatchString(name) {
		return fmt.Errorf("cluster name %q is not a valid DNS-1123 label (lowercase alphanumeric and hyphens, 1-63 chars, no leading/trailing hyphens)", name)
	}
	return nil
}

func (m *LocalClusterManager) CreateCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", "Checking prerequisites...", progressValidating)
	if tool == "kind" || tool == "k3d" {
		if err := m.checkDockerRunning(); err != nil {
			return err
		}
	}
	m.broadcastProgress(tool, name, "creating", fmt.Sprintf("Creating %s cluster '%s'...", tool, name), progressCreating)
	switch tool {
	case "kind":
		return m.createKindCluster(name)
	case "k3d":
		return m.createK3dCluster(name)
	case "minikube":
		return m.createMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) StartCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to start cluster '%s'...", name), progressValidating)
	m.broadcastProgress(tool, name, "starting", fmt.Sprintf("Starting %s cluster '%s'...", tool, name), progressCreating)
	switch tool {
	case "kind":
		return m.startKindCluster(name)
	case "k3d":
		return m.startK3dCluster(name)
	case "minikube":
		return m.startMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) StopCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to stop cluster '%s'...", name), progressValidating)
	m.broadcastProgress(tool, name, "stopping", fmt.Sprintf("Stopping %s cluster '%s'...", tool, name), progressCreating)
	switch tool {
	case "kind":
		return m.stopKindCluster(name)
	case "k3d":
		return m.stopK3dCluster(name)
	case "minikube":
		return m.stopMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}

func (m *LocalClusterManager) DeleteCluster(tool, name string) error {
	if err := validateClusterName(name); err != nil {
		return err
	}
	m.broadcastProgress(tool, name, "validating", fmt.Sprintf("Preparing to delete cluster '%s'...", name), progressValidating)
	m.broadcastProgress(tool, name, "deleting", fmt.Sprintf("Deleting %s cluster '%s'...", tool, name), progressDeleting)
	switch tool {
	case "kind":
		return m.deleteKindCluster(name)
	case "k3d":
		return m.deleteK3dCluster(name)
	case "minikube":
		return m.deleteMinikubeCluster(name)
	default:
		return fmt.Errorf("unsupported tool: %s", tool)
	}
}
