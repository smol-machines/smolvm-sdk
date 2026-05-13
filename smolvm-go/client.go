package smolvm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultServerURL is the default smolvm serve address.
const DefaultServerURL = "http://127.0.0.1:8080"

// defaultRequestTimeout is the per-request timeout used when the caller does
// not specify one (and the request is not a long-lived stream).
const defaultRequestTimeout = 30 * time.Second

// defaultPullTimeout is used by PullImage when no other timeout is set.
const defaultPullTimeout = 5 * time.Minute

// HTTPClient is the minimal interface the SDK needs from an HTTP client.
// *http.Client satisfies this; pass your own for custom transports.
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

// Client is a low-level HTTP client for the smolvm API.
type Client struct {
	baseURL string
	http    HTTPClient
}

// ClientOption configures a Client.
type ClientOption func(*Client)

// WithHTTPClient overrides the underlying HTTP client.
func WithHTTPClient(h HTTPClient) ClientOption {
	return func(c *Client) { c.http = h }
}

// NewClient creates a Client targeting baseURL (defaults to DefaultServerURL
// when empty). The default *http.Client has no timeout — per-request deadlines
// are applied via the request context.
//
// baseURL may be:
//   - http://host:port or https://host:port — standard TCP HTTP
//   - unix:///path/to/socket — connects to the smolvm server over a Unix
//     domain socket. The path after the unix:// scheme is used as the
//     socket; URL building uses http://unix as the synthetic host so any
//     Go http.Request remains valid. When combined with WithHTTPClient,
//     the caller's *http.Client fields (Timeout, CheckRedirect, …) are
//     preserved but Transport is replaced with a unix-dialing one; a
//     non-*http.Client HTTPClient cannot be retrofitted and will panic.
func NewClient(baseURL string, opts ...ClientOption) *Client {
	if baseURL == "" {
		baseURL = DefaultServerURL
	}
	c := &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{},
	}
	for _, opt := range opts {
		opt(c)
	}
	if socketPath, ok := unixSocketPath(baseURL); ok {
		c.baseURL = "http://unix"
		// Install a unix-dialing transport on the *http.Client, preserving
		// fields like Timeout/CheckRedirect. We clobber Transport because a
		// TCP-dialing transport cannot reach an AF_UNIX socket. If a caller
		// supplied a custom HTTPClient (not *http.Client), we cannot inject
		// the dialer — that combination is a programmer error.
		h, ok := c.http.(*http.Client)
		if !ok {
			panic("smolvm: unix:// baseURL requires *http.Client; WithHTTPClient was given a custom HTTPClient that cannot dial AF_UNIX")
		}
		h.Transport = &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		}
	}
	return c
}

// unixSocketPath returns the filesystem path of a unix:// URL, if the input
// is one. Accepted forms are unix:///abs/path and unix:/abs/path.
func unixSocketPath(s string) (string, bool) {
	if strings.HasPrefix(s, "unix://") {
		return strings.TrimPrefix(s, "unix://"), true
	}
	if strings.HasPrefix(s, "unix:") {
		return strings.TrimPrefix(s, "unix:"), true
	}
	return "", false
}

// BaseURL returns the configured server URL.
func (c *Client) BaseURL() string { return c.baseURL }

// request issues a JSON request and decodes the response into out (if non-nil).
func (c *Client) request(ctx context.Context, method, path string, body any, out any, timeout time.Duration) error {
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	var reqBody io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("smolvm: marshal request: %w", err)
		}
		reqBody = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return NewConnectionError(err.Error())
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			if timeout > 0 {
				return NewTimeoutError(fmt.Sprintf("request timed out after %s", timeout))
			}
			return NewTimeoutError("request deadline exceeded")
		}
		if errors.Is(err, context.Canceled) {
			return err
		}
		return NewConnectionError(fmt.Sprintf("connect to %s: %s", c.baseURL, err.Error()))
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return readAPIError(resp)
	}

	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("smolvm: decode response: %w", err)
	}
	return nil
}

// readAPIError consumes resp.Body and returns a typed *Error.
func readAPIError(resp *http.Response) error {
	var body ApiErrorResponse
	raw, _ := io.ReadAll(resp.Body)
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &body)
	}
	if body.Error == "" {
		body.Error = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, http.StatusText(resp.StatusCode))
	}
	return ParseAPIError(resp.StatusCode, body)
}

// =========================================================================
// Health
// =========================================================================

// Health checks the smolvm server's health endpoint.
func (c *Client) Health(ctx context.Context) (*HealthResponse, error) {
	var out HealthResponse
	if err := c.request(ctx, http.MethodGet, "/health", nil, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// =========================================================================
// Machines
// =========================================================================

// CreateMachine creates a new machine on the server.
func (c *Client) CreateMachine(ctx context.Context, req CreateMachineRequest) (*MachineInfo, error) {
	var out MachineInfo
	if err := c.request(ctx, http.MethodPost, "/api/v1/machines", req, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListMachines returns all known machines.
func (c *Client) ListMachines(ctx context.Context) ([]MachineInfo, error) {
	var out ListMachinesResponse
	if err := c.request(ctx, http.MethodGet, "/api/v1/machines", nil, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return out.Machines, nil
}

// GetMachine fetches a single machine by name.
func (c *Client) GetMachine(ctx context.Context, name string) (*MachineInfo, error) {
	var out MachineInfo
	path := fmt.Sprintf("/api/v1/machines/%s", url.PathEscape(name))
	if err := c.request(ctx, http.MethodGet, path, nil, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// StartMachine starts a previously-created machine.
func (c *Client) StartMachine(ctx context.Context, name string) (*MachineInfo, error) {
	var out MachineInfo
	path := fmt.Sprintf("/api/v1/machines/%s/start", url.PathEscape(name))
	// Starting a VM may take a few seconds; allow extra headroom over the default.
	if err := c.request(ctx, http.MethodPost, path, nil, &out, 60*time.Second); err != nil {
		return nil, err
	}
	return &out, nil
}

// StopMachine stops a running machine.
func (c *Client) StopMachine(ctx context.Context, name string) (*MachineInfo, error) {
	var out MachineInfo
	path := fmt.Sprintf("/api/v1/machines/%s/stop", url.PathEscape(name))
	if err := c.request(ctx, http.MethodPost, path, nil, &out, 60*time.Second); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteMachine deletes a machine. Pass force=true to delete even if the VM is
// still running (may orphan the process).
func (c *Client) DeleteMachine(ctx context.Context, name string, force bool) (*DeleteResponse, error) {
	path := fmt.Sprintf("/api/v1/machines/%s", url.PathEscape(name))
	if force {
		path += "?force=true"
	}
	var out DeleteResponse
	if err := c.request(ctx, http.MethodDelete, path, nil, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// ResizeMachine adjusts disk sizes (storage/overlay). Sizes can only be expanded.
func (c *Client) ResizeMachine(ctx context.Context, name string, req ResizeMachineRequest) (*MachineInfo, error) {
	var out MachineInfo
	path := fmt.Sprintf("/api/v1/machines/%s/resize", url.PathEscape(name))
	if err := c.request(ctx, http.MethodPost, path, req, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// =========================================================================
// Execution
// =========================================================================

// Exec runs a command directly in the machine VM (no container).
func (c *Client) Exec(ctx context.Context, machine string, req ExecRequest) (*ExecResponse, error) {
	var out ExecResponse
	path := fmt.Sprintf("/api/v1/machines/%s/exec", url.PathEscape(machine))
	timeout := execHTTPTimeout(req.TimeoutSecs)
	if err := c.request(ctx, http.MethodPost, path, req, &out, timeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// Run executes a command inside an OCI image within the machine.
func (c *Client) Run(ctx context.Context, machine string, req RunRequest) (*ExecResponse, error) {
	var out ExecResponse
	path := fmt.Sprintf("/api/v1/machines/%s/run", url.PathEscape(machine))
	timeout := execHTTPTimeout(req.TimeoutSecs)
	if err := c.request(ctx, http.MethodPost, path, req, &out, timeout); err != nil {
		return nil, err
	}
	return &out, nil
}

// execHTTPTimeout returns a sensible HTTP-level timeout given the user-supplied
// command timeout (in seconds). We add headroom so the server has time to
// return a TIMEOUT error before our HTTP request gives up.
func execHTTPTimeout(timeoutSecs *int64) time.Duration {
	if timeoutSecs == nil || *timeoutSecs <= 0 {
		return 0 // no client-side timeout — caller controls via ctx
	}
	return time.Duration(*timeoutSecs+10) * time.Second
}

// =========================================================================
// Images
// =========================================================================

// ListImages lists images stored in the machine's local cache.
func (c *Client) ListImages(ctx context.Context, machine string) ([]ImageInfo, error) {
	var out ListImagesResponse
	path := fmt.Sprintf("/api/v1/machines/%s/images", url.PathEscape(machine))
	if err := c.request(ctx, http.MethodGet, path, nil, &out, defaultRequestTimeout); err != nil {
		return nil, err
	}
	return out.Images, nil
}

// PullImage pulls an OCI image into the machine. Uses defaultPullTimeout
// when ctx has no deadline.
func (c *Client) PullImage(ctx context.Context, machine string, req PullImageRequest) (*ImageInfo, error) {
	var out PullImageResponse
	path := fmt.Sprintf("/api/v1/machines/%s/images/pull", url.PathEscape(machine))
	timeout := defaultPullTimeout
	if _, ok := ctx.Deadline(); ok {
		timeout = 0
	}
	if err := c.request(ctx, http.MethodPost, path, req, &out, timeout); err != nil {
		return nil, err
	}
	return &out.Image, nil
}

// =========================================================================
// Files
// =========================================================================

// UploadFile writes data to the given path inside the machine, creating parent
// directories as needed.
func (c *Client) UploadFile(ctx context.Context, machine, path string, data []byte) (*FileUploadResponse, error) {
	if timeout := uploadDownloadTimeout(len(data)); timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	uri := fmt.Sprintf("%s/api/v1/machines/%s/files/%s",
		c.baseURL, url.PathEscape(machine), encodeFilePath(path))

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, uri, bytes.NewReader(data))
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Accept", "application/json")
	req.ContentLength = int64(len(data))

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, readAPIError(resp)
	}

	var out FileUploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("smolvm: decode response: %w", err)
	}
	return &out, nil
}

// DownloadFile reads a file from inside the machine. Note: the entire file is
// buffered in memory; for large files prefer DownloadFileStream.
func (c *Client) DownloadFile(ctx context.Context, machine, path string) ([]byte, error) {
	rc, err := c.DownloadFileStream(ctx, machine, path)
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// DownloadFileStream returns a streaming reader for a file inside the machine.
// The caller is responsible for calling Close on the returned io.ReadCloser.
func (c *Client) DownloadFileStream(ctx context.Context, machine, path string) (io.ReadCloser, error) {
	uri := fmt.Sprintf("%s/api/v1/machines/%s/files/%s",
		c.baseURL, url.PathEscape(machine), encodeFilePath(path))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	req.Header.Set("Accept", "application/octet-stream")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	if resp.StatusCode >= 400 {
		err := readAPIError(resp)
		resp.Body.Close()
		return nil, err
	}
	return resp.Body, nil
}

// uploadDownloadTimeout returns a per-call timeout sized for the payload.
// 30s base + 1s per MiB, with a floor of 60s.
func uploadDownloadTimeout(byteCount int) time.Duration {
	base := 30 * time.Second
	per := time.Duration(byteCount/(1024*1024)) * time.Second
	total := base + per
	if total < 60*time.Second {
		total = 60 * time.Second
	}
	return total
}

// encodeFilePath path-encodes each segment but preserves the slashes,
// matching the wildcard route on the server.
func encodeFilePath(p string) string {
	p = strings.TrimPrefix(p, "/")
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

// =========================================================================
// Logs
// =========================================================================

// StreamLogs opens an SSE log stream for a machine. The returned channel
// closes when the stream ends or ctx is cancelled. Errors during streaming
// are surfaced via the second return when StreamLogs itself fails to open;
// transport errors mid-stream cause the channel to close.
func (c *Client) StreamLogs(ctx context.Context, machine string, query LogsQuery) (<-chan string, error) {
	uri := fmt.Sprintf("%s/api/v1/machines/%s/logs", c.baseURL, url.PathEscape(machine))
	q := url.Values{}
	if query.Follow {
		q.Set("follow", "true")
	}
	if query.Tail != nil {
		q.Set("tail", strconv.Itoa(*query.Tail))
	}
	if query.Format != "" {
		q.Set("format", query.Format)
	}
	if encoded := q.Encode(); encoded != "" {
		uri += "?" + encoded
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	if resp.StatusCode >= 400 {
		err := readAPIError(resp)
		resp.Body.Close()
		return nil, err
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		scanSSE(resp.Body, func(event StreamEvent) {
			if event.Data == "" {
				return
			}
			select {
			case ch <- event.Data:
			case <-ctx.Done():
			}
		})
	}()
	return ch, nil
}

// =========================================================================
// Streaming exec
// =========================================================================

// StreamEvent is a single SSE event from /exec/stream.
type StreamEvent struct {
	// Event is the SSE event name: "stdout", "stderr", "exit", or "error".
	Event string
	// Data is the event payload. For "exit" it is a JSON object like
	// {"exitCode":0}. For "stdout"/"stderr" it is the raw output line.
	Data string
}

// ExecStream issues a streaming exec call and returns a channel of events.
// The channel is closed when the stream ends or ctx is cancelled.
func (c *Client) ExecStream(ctx context.Context, machine string, req ExecRequest) (<-chan StreamEvent, error) {
	uri := fmt.Sprintf("%s/api/v1/machines/%s/exec/stream", c.baseURL, url.PathEscape(machine))

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("smolvm: marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, uri, bytes.NewReader(body))
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, NewConnectionError(err.Error())
	}
	if resp.StatusCode >= 400 {
		err := readAPIError(resp)
		resp.Body.Close()
		return nil, err
	}

	ch := make(chan StreamEvent, 16)
	go func() {
		defer close(ch)
		scanSSE(resp.Body, func(event StreamEvent) {
			select {
			case ch <- event:
			case <-ctx.Done():
			}
		})
	}()
	return ch, nil
}
