package agent

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateBaseURL_RejectsUnresolvableHost(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")
	withStubbedAIProviderLookup(t, func(context.Context, string) ([]net.IPAddr, error) {
		return nil, errors.New("dns timeout")
	})

	err := validateBaseURL("https://rebind.example")
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to resolve host \"rebind.example\"")
}

func TestAIProviderHTTPTransport_BlocksPrivateResolution(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")
	withStubbedAIProviderLookup(t, func(_ context.Context, host string) ([]net.IPAddr, error) {
		require.Equal(t, "rebind.example", host)
		return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
	})

	called := false
	previousDial := aiProviderDialContextFunc
	aiProviderDialContextFunc = func(context.Context, string, string) (net.Conn, error) {
		called = true
		return nil, nil
	}
	t.Cleanup(func() {
		aiProviderDialContextFunc = previousDial
	})

	transport := newAIProviderHTTPTransport(allowLocalProviders)
	_, err := transport.DialContext(t.Context(), "tcp", "rebind.example:443")
	require.Error(t, err)
	require.Contains(t, err.Error(), aiProviderPrivateIPError)
	require.False(t, called, "dialer should not be invoked for blocked private IPs")
}

func TestAIProviderHTTPTransport_DialsPinnedResolvedIP(t *testing.T) {
	t.Setenv("ALLOW_LOCAL_PROVIDERS", "")
	withStubbedAIProviderLookup(t, func(_ context.Context, host string) ([]net.IPAddr, error) {
		require.Equal(t, "public.example", host)
		return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
	})

	sentinelErr := errors.New("dial attempted")
	previousDial := aiProviderDialContextFunc
	aiProviderDialContextFunc = func(_ context.Context, network, addr string) (net.Conn, error) {
		require.Equal(t, "tcp", network)
		require.Equal(t, "93.184.216.34:443", addr)
		return nil, sentinelErr
	}
	t.Cleanup(func() {
		aiProviderDialContextFunc = previousDial
	})

	transport := newAIProviderHTTPTransport(allowLocalProviders)
	_, err := transport.DialContext(t.Context(), "tcp", "public.example:443")
	require.ErrorIs(t, err, sentinelErr)
	require.False(t, strings.Contains(err.Error(), "public.example:443"), "transport should dial the resolved IP directly")
}

func TestAIProviderHTTPClient_DisablesRedirects(t *testing.T) {
	client := newSecuredAIProviderHTTPClient(func() bool { return false }, aiProviderHTTPTimeout)
	req := require.New(t)
	err := client.CheckRedirect(&http.Request{}, []*http.Request{{}})
	req.ErrorIs(err, http.ErrUseLastResponse)
}
