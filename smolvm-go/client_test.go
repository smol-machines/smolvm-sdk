package smolvm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestClientHealth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(HealthResponse{Status: "ok", Version: "test"})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	got, err := c.Health(context.Background())
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if got.Status != "ok" || got.Version != "test" {
		t.Errorf("Health = %+v", got)
	}
}

func TestClientCreateMachineFlatPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var got map[string]any
		if err := json.Unmarshal(body, &got); err != nil {
			t.Fatalf("unmarshal payload: %v", err)
		}
		// The server expects flat resource fields (the OpenAPI spec lists
		// cpus/memoryMb/network at the top level of CreateMachineRequest).
		for _, key := range []string{"name", "cpus", "memoryMb", "network"} {
			if _, ok := got[key]; !ok {
				t.Errorf("missing %q in payload: %s", key, body)
			}
		}
		if _, has := got["resources"]; has {
			t.Errorf("payload should not nest resources: %s", body)
		}

		_ = json.NewEncoder(w).Encode(MachineInfo{
			Name: "vm1", State: MachineStateCreated,
			CPUs: 2, MemoryMB: 1024, Network: true,
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	info, err := c.CreateMachine(context.Background(), CreateMachineRequest{
		Name: "vm1", CPUs: 2, MemoryMB: 1024, Network: true,
	})
	if err != nil {
		t.Fatalf("CreateMachine: %v", err)
	}
	if info.Name != "vm1" || info.CPUs != 2 || !info.Network {
		t.Errorf("info=%+v", info)
	}
}

func TestClientErrorMapping(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(ApiErrorResponse{Error: "machine 'x' not found", Code: "NOT_FOUND"})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	_, err := c.GetMachine(context.Background(), "x")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.StatusCode != 404 {
		t.Errorf("StatusCode = %d", apiErr.StatusCode)
	}
}

func TestClientStreamLogs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		_, _ = io.WriteString(w, "data: line one\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "data: line two\n\n")
		flusher.Flush()
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	ch, err := c.StreamLogs(context.Background(), "vm1", LogsQuery{})
	if err != nil {
		t.Fatalf("StreamLogs: %v", err)
	}

	var got []string
	for line := range ch {
		got = append(got, line)
	}
	if len(got) != 2 || got[0] != "line one" || got[1] != "line two" {
		t.Errorf("got %v", got)
	}
}

func TestClientUploadFile(t *testing.T) {
	const payload = "print('hi')\n"
	var (
		gotMethod, gotPath, gotCT string
		gotContentLength          int64
		gotBody                   []byte
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotCT = r.Header.Get("Content-Type")
		gotContentLength = r.ContentLength
		gotBody, _ = io.ReadAll(r.Body)
		_ = json.NewEncoder(w).Encode(FileUploadResponse{Path: "/workspace/script.py", Size: int64(len(gotBody))})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	resp, err := c.UploadFile(context.Background(), "vm1", "workspace/script.py", []byte(payload))
	if err != nil {
		t.Fatalf("UploadFile: %v", err)
	}
	if gotMethod != http.MethodPut {
		t.Errorf("method = %s, want PUT", gotMethod)
	}
	if !strings.HasSuffix(gotPath, "/files/workspace/script.py") {
		t.Errorf("path = %s", gotPath)
	}
	if gotCT != "application/octet-stream" {
		t.Errorf("Content-Type = %s", gotCT)
	}
	if gotContentLength != int64(len(payload)) {
		t.Errorf("Content-Length = %d, want %d", gotContentLength, len(payload))
	}
	if string(gotBody) != payload {
		t.Errorf("body = %q, want %q", gotBody, payload)
	}
	if resp.Size != int64(len(payload)) {
		t.Errorf("size=%d", resp.Size)
	}
}

func TestClientDownloadFile(t *testing.T) {
	const want = "downloaded contents"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s, want GET", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/files/data/blob.bin") {
			t.Errorf("path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = io.WriteString(w, want)
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	got, err := c.DownloadFile(context.Background(), "vm1", "data/blob.bin")
	if err != nil {
		t.Fatalf("DownloadFile: %v", err)
	}
	if string(got) != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestClientPullImage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/images/pull") {
			t.Errorf("path: %s", r.URL.Path)
		}
		var req PullImageRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.Image != "alpine" {
			t.Errorf("image = %q", req.Image)
		}
		_ = json.NewEncoder(w).Encode(PullImageResponse{Image: ImageInfo{
			Reference: "alpine", Digest: "sha256:abc", Size: 1234, Architecture: "arm64", OS: "linux", LayerCount: 1,
		}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	img, err := c.PullImage(context.Background(), "vm1", PullImageRequest{Image: "alpine"})
	if err != nil {
		t.Fatalf("PullImage: %v", err)
	}
	if img.Reference != "alpine" || img.LayerCount != 1 {
		t.Errorf("img=%+v", img)
	}
}

func TestClientResizeMachine(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/resize") {
			t.Errorf("path: %s", r.URL.Path)
		}
		var req ResizeMachineRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if req.StorageGB == nil || *req.StorageGB != 50 {
			t.Errorf("storageGb=%v", req.StorageGB)
		}
		_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateRunning, StorageGB: req.StorageGB})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	storage := int64(50)
	info, err := c.ResizeMachine(context.Background(), "vm1", ResizeMachineRequest{StorageGB: &storage})
	if err != nil {
		t.Fatalf("ResizeMachine: %v", err)
	}
	if info.StorageGB == nil || *info.StorageGB != 50 {
		t.Errorf("info.StorageGB=%v", info.StorageGB)
	}
}

func TestClientDeleteForceFlag(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(DeleteResponse{Deleted: "vm1"})
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	if _, err := c.DeleteMachine(context.Background(), "vm1", true); err != nil {
		t.Fatalf("DeleteMachine: %v", err)
	}
	if gotQuery != "force=true" {
		t.Errorf("query = %q", gotQuery)
	}
}

func TestClientExecStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		_, _ = io.WriteString(w, "event: stdout\ndata: hello\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: stderr\ndata: warn\n\n")
		flusher.Flush()
		_, _ = io.WriteString(w, "event: exit\ndata: {\"exitCode\":0}\n\n")
		flusher.Flush()
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	ch, err := c.ExecStream(context.Background(), "vm1", ExecRequest{Command: []string{"echo", "hi"}})
	if err != nil {
		t.Fatalf("ExecStream: %v", err)
	}
	var events []StreamEvent
	for ev := range ch {
		events = append(events, ev)
	}
	if len(events) != 3 {
		t.Fatalf("got %d events, want 3: %+v", len(events), events)
	}
	if events[0].Event != "stdout" || events[0].Data != "hello" {
		t.Errorf("event[0] = %+v", events[0])
	}
	if events[2].Event != "exit" || events[2].Data != `{"exitCode":0}` {
		t.Errorf("event[2] = %+v", events[2])
	}
}

func TestClientConnectionError(t *testing.T) {
	// Use a port that should not be listening.
	c := NewClient("http://127.0.0.1:1")
	_, err := c.Health(context.Background())
	if !errors.Is(err, ErrConnection) {
		t.Errorf("expected ErrConnection, got %v", err)
	}
}

func TestClientContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	c := NewClient(srv.URL)
	errCh := make(chan error, 1)
	go func() {
		_, err := c.Health(ctx)
		errCh <- err
	}()
	cancel()
	select {
	case err := <-errCh:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("expected context.Canceled, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Health did not return after context cancellation")
	}
}

func TestClientUnixSocket(t *testing.T) {
	sockPath := filepath.Join(t.TempDir(), "smolvm.sock")
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.Host != "unix" {
			t.Errorf("Host header = %q, want unix", r.Host)
		}
		_ = json.NewEncoder(w).Encode(HealthResponse{Status: "ok", Version: "test"})
	})}
	go func() { _ = srv.Serve(ln) }()
	defer func() {
		_ = srv.Close()
	}()

	c := NewClient("unix://" + sockPath)
	got, err := c.Health(context.Background())
	if err != nil {
		t.Fatalf("Health: %v", err)
	}
	if got.Status != "ok" {
		t.Errorf("Health = %+v", got)
	}
}

func TestUnixSocketPathParse(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"unix:///run/smolvm.sock", "/run/smolvm.sock", true},
		{"unix:/run/smolvm.sock", "/run/smolvm.sock", true},
		{"http://127.0.0.1:8080", "", false},
		{"https://example.com", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		got, ok := unixSocketPath(tc.in)
		if got != tc.want || ok != tc.ok {
			t.Errorf("unixSocketPath(%q) = (%q, %v), want (%q, %v)", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestClientUnixKeepsHTTPFields(t *testing.T) {
	// WithHTTPClient(&http.Client{Timeout: ...}) + unix:// must keep the
	// caller's Timeout while still installing the unix-dialing transport.
	// Use a short /tmp path to stay under macOS' 104-byte sun_path limit.
	f, err := os.CreateTemp("/tmp", "smv-*.sock")
	if err != nil {
		t.Fatalf("temp sock: %v", err)
	}
	sockPath := f.Name()
	_ = f.Close()
	_ = os.Remove(sockPath)
	t.Cleanup(func() { _ = os.Remove(sockPath) })

	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("listen unix: %v", err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
	})}
	go func() { _ = srv.Serve(ln) }()
	defer srv.Close()

	supplied := &http.Client{Timeout: 7 * time.Second}
	c := NewClient("unix://"+sockPath, WithHTTPClient(supplied))

	if _, err := c.Health(context.Background()); err != nil {
		t.Fatalf("Health: %v", err)
	}
	if supplied.Timeout != 7*time.Second {
		t.Errorf("Timeout was reset to %v", supplied.Timeout)
	}
	if supplied.Transport == nil {
		t.Errorf("Transport was not installed")
	}
}

type stubHTTPClient struct{}

func (stubHTTPClient) Do(*http.Request) (*http.Response, error) { return nil, nil }

func TestClientUnixPanicsOnCustomHTTP(t *testing.T) {
	// A non-*http.Client implementation of HTTPClient cannot have its dialer
	// rewritten, so unix:// + that combination must fail loudly at
	// construction rather than silently TCP-dialing at request time.
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic, got none")
		}
		msg, _ := r.(string)
		if !strings.Contains(msg, "unix") {
			t.Errorf("panic message = %q; want it to mention unix", msg)
		}
	}()
	NewClient("unix:///tmp/does-not-matter.sock", WithHTTPClient(stubHTTPClient{}))
}
