package presets

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

// fakePresetServer simulates the minimum smolvm endpoints the presets need:
// create + start + pull + run + stop + delete. It records pull/run order so
// tests can verify the preset pulls before running.
func fakePresetServer(t *testing.T, recordedRun *atomic.Pointer[smolvm.RunRequest]) *httptest.Server {
	var pullCalls, runCalls atomic.Int64
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/machines", func(w http.ResponseWriter, r *http.Request) {
		var req smolvm.CreateMachineRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		_ = json.NewEncoder(w).Encode(smolvm.MachineInfo{Name: req.Name, State: smolvm.MachineStateCreated, Network: req.Network})
	})
	mux.HandleFunc("/api/v1/machines/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/start"):
			_ = json.NewEncoder(w).Encode(smolvm.MachineInfo{State: smolvm.MachineStateRunning})
		case strings.HasSuffix(path, "/stop"):
			_ = json.NewEncoder(w).Encode(smolvm.MachineInfo{State: smolvm.MachineStateStopped})
		case strings.HasSuffix(path, "/images/pull"):
			pullCalls.Add(1)
			_ = json.NewEncoder(w).Encode(smolvm.PullImageResponse{Image: smolvm.ImageInfo{Reference: "python:3.12-alpine"}})
		case strings.HasSuffix(path, "/run"):
			if pullCalls.Load() == 0 {
				t.Errorf("run called before pull")
			}
			runCalls.Add(1)
			var req smolvm.RunRequest
			_ = json.NewDecoder(r.Body).Decode(&req)
			recordedRun.Store(&req)
			_ = json.NewEncoder(w).Encode(smolvm.ExecResponse{ExitCode: 0, Stdout: "ok\n"})
		case r.Method == http.MethodDelete:
			_ = json.NewEncoder(w).Encode(smolvm.DeleteResponse{Deleted: "vm1"})
		default:
			_ = json.NewEncoder(w).Encode(smolvm.MachineInfo{State: smolvm.MachineStateRunning})
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestPythonCodePullsThenRuns(t *testing.T) {
	var run atomic.Pointer[smolvm.RunRequest]
	srv := fakePresetServer(t, &run)

	result, err := PythonCode(context.Background(), "print('hi')", PythonOptions{
		Name:      "py-test",
		ServerURL: srv.URL,
	})
	if err != nil {
		t.Fatalf("PythonCode: %v", err)
	}
	if result.Stdout != "ok\n" {
		t.Errorf("stdout = %q", result.Stdout)
	}

	got := run.Load()
	if got == nil {
		t.Fatal("run was never called")
	}
	if got.Image != DefaultPythonImage {
		t.Errorf("image = %q, want %q", got.Image, DefaultPythonImage)
	}
	if len(got.Command) != 3 || got.Command[0] != "python" || got.Command[1] != "-c" {
		t.Errorf("command = %v", got.Command)
	}
}

func TestNodeCodePullsThenRuns(t *testing.T) {
	var run atomic.Pointer[smolvm.RunRequest]
	srv := fakePresetServer(t, &run)

	if _, err := NodeCode(context.Background(), "console.log(1)", NodeOptions{
		Name:      "node-test",
		ServerURL: srv.URL,
	}); err != nil {
		t.Fatalf("NodeCode: %v", err)
	}
	got := run.Load()
	if got == nil || got.Image != DefaultNodeImage || got.Command[0] != "node" {
		t.Errorf("run = %+v", got)
	}
}

func TestPresetMachineConfigEnablesNetwork(t *testing.T) {
	cfg := PythonOptions{}.machineConfig()
	if !cfg.Network {
		t.Errorf("preset config Network = false; want true (image pulls require it)")
	}
}
