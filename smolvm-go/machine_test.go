package smolvm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

// fakeServer implements the subset of the API needed by the high-level Machine tests.
func fakeServer(t *testing.T) (*httptest.Server, *atomic.Int64) {
	var startCalls atomic.Int64
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/machines", func(w http.ResponseWriter, r *http.Request) {
		var req CreateMachineRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode: %v", err)
		}
		_ = json.NewEncoder(w).Encode(MachineInfo{
			Name: req.Name, State: MachineStateCreated,
			CPUs: req.CPUs, MemoryMB: req.MemoryMB, Network: req.Network,
		})
	})
	mux.HandleFunc("/api/v1/machines/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/start"):
			startCalls.Add(1)
			_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateRunning})
		case strings.HasSuffix(path, "/stop"):
			_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateStopped})
		case strings.HasSuffix(path, "/exec"):
			_ = json.NewEncoder(w).Encode(ExecResponse{ExitCode: 0, Stdout: "hello\n"})
		case strings.HasSuffix(path, "/run"):
			_ = json.NewEncoder(w).Encode(ExecResponse{ExitCode: 0, Stdout: "ran\n"})
		case r.Method == http.MethodDelete:
			_ = json.NewEncoder(w).Encode(DeleteResponse{Deleted: "vm1"})
		default:
			_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateRunning})
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, &startCalls
}

func TestMachineLifecycleStartStopDelete(t *testing.T) {
	srv, startCalls := fakeServer(t)
	m := NewMachine(Config{Name: "vm1", ServerURL: srv.URL})

	ctx := context.Background()
	if err := m.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if !m.IsStarted() {
		t.Errorf("IsStarted=false after Start")
	}

	// Second Start is a no-op — the server should not see another start call.
	if err := m.Start(ctx); err != nil {
		t.Fatalf("Start (second): %v", err)
	}
	if got := startCalls.Load(); got != 1 {
		t.Errorf("server saw %d /start calls, want 1", got)
	}

	if err := m.Stop(ctx); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if m.IsStarted() {
		t.Errorf("IsStarted=true after Stop")
	}

	if err := m.Delete(ctx); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if m.Info() != nil {
		t.Errorf("Info() not cleared after Delete: %+v", m.Info())
	}
}

func TestMachineExecAndRun(t *testing.T) {
	srv, _ := fakeServer(t)
	m, err := CreateMachine(context.Background(), Config{Name: "vm1", ServerURL: srv.URL})
	if err != nil {
		t.Fatalf("CreateMachine: %v", err)
	}

	ctx := context.Background()
	out, err := m.Exec(ctx, []string{"echo", "hello"})
	if err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if !out.Success() || out.Stdout != "hello\n" {
		t.Errorf("Exec result: %+v", out)
	}

	out, err = m.Run(ctx, "alpine", []string{"sh", "-c", "echo ran"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if out.Stdout != "ran\n" {
		t.Errorf("Run result: %+v", out)
	}
}

func TestWithMachineCleansUp(t *testing.T) {
	srv, _ := fakeServer(t)
	ctx := context.Background()

	err := WithMachine(ctx, Config{Name: "vm1", ServerURL: srv.URL}, func(ctx context.Context, m *Machine) error {
		_, err := m.Exec(ctx, []string{"true"})
		return err
	})
	if err != nil {
		t.Fatalf("WithMachine: %v", err)
	}
}

func TestMachineStartIsSerialised(t *testing.T) {
	// Concurrent Start() callers must not all reach the server. Only one
	// CreateMachine + StartMachine pair should fire; the rest become no-ops.
	srv, startCalls := fakeServer(t)
	var createCalls atomic.Int64
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/machines", func(w http.ResponseWriter, r *http.Request) {
		createCalls.Add(1)
		var req CreateMachineRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		_ = json.NewEncoder(w).Encode(MachineInfo{Name: req.Name, State: MachineStateCreated})
	})
	mux.HandleFunc("/api/v1/machines/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/start") {
			startCalls.Add(1)
			_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateRunning})
			return
		}
		_ = json.NewEncoder(w).Encode(MachineInfo{Name: "vm1", State: MachineStateRunning})
	})
	srv.Config.Handler = mux

	m := NewMachine(Config{Name: "vm1", ServerURL: srv.URL})

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := m.Start(context.Background()); err != nil {
				t.Errorf("Start: %v", err)
			}
		}()
	}
	wg.Wait()

	if c := createCalls.Load(); c != 1 {
		t.Errorf("create calls = %d, want 1", c)
	}
	if s := startCalls.Load(); s != 1 {
		t.Errorf("start calls = %d, want 1", s)
	}
}

func TestGenerateMachineNameUnique(t *testing.T) {
	seen := make(map[string]struct{}, 1000)
	for i := 0; i < 1000; i++ {
		name := GenerateMachineName("test")
		if _, dup := seen[name]; dup {
			t.Fatalf("duplicate name on iteration %d: %s", i, name)
		}
		seen[name] = struct{}{}
	}
}

func TestEnvVarSliceContainsAllPairs(t *testing.T) {
	// envVarSlice iterates a map; ordering is non-deterministic but the slice
	// should always contain the same name/value pairs. Verify by membership.
	got := envVarSlice(map[string]string{"A": "1", "B": "2"})
	if len(got) != 2 {
		t.Fatalf("len=%d, want 2", len(got))
	}
	seen := map[string]string{}
	for _, e := range got {
		seen[e.Name] = e.Value
	}
	if seen["A"] != "1" || seen["B"] != "2" {
		t.Errorf("unexpected map: %v", seen)
	}
}
