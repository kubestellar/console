package handlers

import "github.com/kubestellar/console/pkg/api/transport"

// Type aliases allow handler files to continue using Hub, Message, and Client
// without a qualifying package prefix. External consumers (route files,
// sub-packages) should import pkg/api/transport directly.
type Hub = transport.Hub
type Message = transport.Message
type Client = transport.Client

// NewHub delegates to transport.NewHub.
var NewHub = transport.NewHub
