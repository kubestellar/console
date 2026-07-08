package agent

// This file provides backward-compatible Server method delegations for the
// kagent/kagenti handlers extracted to pkg/agent/kagent/. The route
// registrations in server_routes.go continue to reference s.handleKagent*
// methods — this file delegates each to the sub-package's Handlers type.

import (
	"net/http"

	"github.com/kubestellar/console/pkg/agent/kagent"
)

// kagentHandlers returns a lazily-initialized *kagent.Handlers wired to this
// Server's HandlerContext and k8sClient.
func (s *Server) kagentHandlers() *kagent.Handlers {
	return &kagent.Handlers{
		Ctx:    s,
		Client: s.k8sClient,
	}
}

func (s *Server) handleKagentCRDAgents(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleCRDAgents(w, r)
}
func (s *Server) handleKagentCRDTools(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleCRDTools(w, r)
}
func (s *Server) handleKagentCRDModels(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleCRDModels(w, r)
}
func (s *Server) handleKagentCRDMemories(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleCRDMemories(w, r)
}
func (s *Server) handleKagentCRDSummary(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleCRDSummary(w, r)
}

func (s *Server) handleKagentiAgents(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleKagentiAgents(w, r)
}
func (s *Server) handleKagentiBuilds(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleKagentiBuilds(w, r)
}
func (s *Server) handleKagentiCards(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleKagentiCards(w, r)
}
func (s *Server) handleKagentiTools(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleKagentiTools(w, r)
}
func (s *Server) handleKagentiSummary(w http.ResponseWriter, r *http.Request) {
	s.kagentHandlers().HandleKagentiSummary(w, r)
}

// Type aliases for backward compatibility with test files.
type kagentCRDAgent = kagent.CRDAgent
type kagentCRDTool = kagent.CRDTool
type kagentCRDModel = kagent.CRDModel
type kagentCRDMemory = kagent.CRDMemory
type kagentiAgent = kagent.Agent
type kagentiBuild = kagent.Build
type kagentiCard = kagent.Card
type kagentiTool = kagent.Tool

// GVR var delegations for backward compatibility with test files.
var (
	agentGVR               = kagent.AgentGVR
	modelConfigGVR         = kagent.ModelConfigGVR
	modelProviderConfigGVR = kagent.ModelProviderConfigGVR
	toolServerGVR          = kagent.ToolServerGVR
	remoteMCPServerGVR     = kagent.RemoteMCPServerGVR
	memoryGVR              = kagent.MemoryGVR
)
