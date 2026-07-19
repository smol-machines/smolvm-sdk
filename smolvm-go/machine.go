package smolvm

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"
)

// Machine is a high-level handle for a smolvm machine. It wraps a Client and
// caches the most recent MachineInfo returned by the server.
type Machine struct {
	Name   string
	Client *Client

	config Config

	// lifecycle serialises Start/Stop so concurrent callers don't double-create
	// or double-stop on the server.
	lifecycle sync.Mutex
	info      atomic.Pointer[MachineInfo]
	started   atomic.Bool
}

// NewMachine returns a Machine handle without contacting the server.
// Call Start to create and start the underlying VM.
func NewMachine(config Config) *Machine {
	var opts []ClientOption
	if config.HTTPClient != nil {
		opts = append(opts, WithHTTPClient(config.HTTPClient))
	}
	return &Machine{
		Name:   config.Name,
		Client: NewClient(config.ServerURL, opts...),
		config: config,
	}
}

// CreateMachine creates a new machine on the server and starts it.
//
// This is the most common entry point for short-lived workloads:
//
//	m, err := smolvm.CreateMachine(ctx, smolvm.Config{Name: "my-machine"})
//	if err != nil { return err }
//	defer m.Delete(ctx)
//	defer m.Stop(ctx)
func CreateMachine(ctx context.Context, config Config) (*Machine, error) {
	m := NewMachine(config)
	if err := m.Start(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

// =========================================================================
// Lifecycle
// =========================================================================

// Start creates the machine on the server (if needed) and starts it.
// Calling Start twice is a no-op. Safe to call concurrently.
func (m *Machine) Start(ctx context.Context) error {
	m.lifecycle.Lock()
	defer m.lifecycle.Unlock()

	if m.started.Load() {
		return nil
	}

	if m.Name == "" {
		return NewBadRequestError("machine name is required")
	}

	req := CreateMachineRequest{
		Name:                  m.config.Name,
		Image:                 m.config.Image,
		From:                  m.config.From,
		RegistryRef:           m.config.RegistryRef,
		RegistryIdentityToken: m.config.RegistryIdentityToken,
		Mounts:                m.config.Mounts,
		Ports:                 m.config.Ports,
		CPUs:                  m.config.CPUs,
		MemoryMB:              m.config.MemoryMB,
		Network:               m.config.Network,
		GPU:                   m.config.GPU,
		StorageGB:             m.config.StorageGB,
		OverlayGB:             m.config.OverlayGB,
		AllowedCidrs:          m.config.AllowedCidrs,
		Restart:               m.config.Restart,
	}

	info, err := m.Client.CreateMachine(ctx, req)
	if err != nil {
		return err
	}
	m.info.Store(info)

	info, err = m.Client.StartMachine(ctx, m.Name)
	if err != nil {
		return err
	}
	m.info.Store(info)
	m.started.Store(true)
	return nil
}

// Stop stops the machine. Calling Stop on an already-stopped machine is a
// no-op. Safe to call concurrently.
func (m *Machine) Stop(ctx context.Context) error {
	m.lifecycle.Lock()
	defer m.lifecycle.Unlock()

	if !m.started.Load() {
		return nil
	}
	info, err := m.Client.StopMachine(ctx, m.Name)
	if err != nil {
		return err
	}
	m.info.Store(info)
	m.started.Store(false)
	return nil
}

// Delete deletes the machine from the server.
func (m *Machine) Delete(ctx context.Context) error {
	if _, err := m.Client.DeleteMachine(ctx, m.Name, false); err != nil {
		return err
	}
	m.info.Store(nil)
	m.started.Store(false)
	return nil
}

// ForceDelete deletes the machine even if the VM is still running. May orphan
// the underlying process — use only when normal Delete fails.
func (m *Machine) ForceDelete(ctx context.Context) error {
	if _, err := m.Client.DeleteMachine(ctx, m.Name, true); err != nil {
		return err
	}
	m.info.Store(nil)
	m.started.Store(false)
	return nil
}

// =========================================================================
// Status
// =========================================================================

// Status fetches the current MachineInfo from the server and updates the
// cached value.
func (m *Machine) Status(ctx context.Context) (*MachineInfo, error) {
	info, err := m.Client.GetMachine(ctx, m.Name)
	if err != nil {
		return nil, err
	}
	m.info.Store(info)
	return info, nil
}

// IsStarted reports whether Start has been called and not yet superseded by Stop/Delete.
func (m *Machine) IsStarted() bool { return m.started.Load() }

// State returns the cached MachineState, or empty string if unknown.
func (m *Machine) State() MachineState {
	info := m.info.Load()
	if info == nil {
		return ""
	}
	return info.State
}

// Mounts returns the cached mount list (may be nil before Start).
func (m *Machine) Mounts() []MountInfo {
	info := m.info.Load()
	if info == nil {
		return nil
	}
	return info.Mounts
}

// Info returns the cached MachineInfo without contacting the server.
func (m *Machine) Info() *MachineInfo {
	return m.info.Load()
}

// =========================================================================
// Execution
// =========================================================================

// Exec executes command directly in the machine VM (no container).
func (m *Machine) Exec(ctx context.Context, command []string, opts ...ExecOptions) (*ExecResult, error) {
	o := mergeExecOpts(opts)
	resp, err := m.Client.Exec(ctx, m.Name, ExecRequest{
		Command:     command,
		Env:         envVarSlice(o.Env),
		Workdir:     o.Workdir,
		TimeoutSecs: timeoutSecsPtr(o.Timeout),
		Stdin:       o.Stdin,
	})
	if err != nil {
		return nil, err
	}
	return newExecResult(resp), nil
}

// Run executes command inside an OCI image within the machine. The image
// must already be cached in the machine — call PullImage first if needed.
// (The presets package handles the pull-then-run flow automatically.)
func (m *Machine) Run(ctx context.Context, image string, command []string, opts ...ExecOptions) (*ExecResult, error) {
	o := mergeExecOpts(opts)
	resp, err := m.Client.Run(ctx, m.Name, RunRequest{
		Image:       image,
		Command:     command,
		Env:         envVarSlice(o.Env),
		Workdir:     o.Workdir,
		TimeoutSecs: timeoutSecsPtr(o.Timeout),
	})
	if err != nil {
		return nil, err
	}
	return newExecResult(resp), nil
}

// ExecStream runs command in the VM and streams its output as StreamEvents.
// The returned channel closes when the command exits or ctx is cancelled.
func (m *Machine) ExecStream(ctx context.Context, command []string, opts ...ExecOptions) (<-chan StreamEvent, error) {
	o := mergeExecOpts(opts)
	return m.Client.ExecStream(ctx, m.Name, ExecRequest{
		Command:     command,
		Env:         envVarSlice(o.Env),
		Workdir:     o.Workdir,
		TimeoutSecs: timeoutSecsPtr(o.Timeout),
	})
}

// =========================================================================
// Logs
// =========================================================================

// Logs streams logs from the machine. Pass LogsOptions{Follow: true} to keep
// the stream open. The channel closes when the stream ends or ctx is
// cancelled.
func (m *Machine) Logs(ctx context.Context, opts ...LogsOptions) (<-chan string, error) {
	var o LogsOptions
	if len(opts) > 0 {
		o = opts[0]
	}
	return m.Client.StreamLogs(ctx, m.Name, LogsQuery{
		Follow: o.Follow,
		Tail:   o.Tail,
	})
}

// =========================================================================
// Images
// =========================================================================

// ListImages returns the images cached inside the machine.
func (m *Machine) ListImages(ctx context.Context) ([]ImageInfo, error) {
	return m.Client.ListImages(ctx, m.Name)
}

// PullImage pulls an OCI image into the machine. Pass an empty ociPlatform to
// let the server choose.
func (m *Machine) PullImage(ctx context.Context, image string, ociPlatform string) (*ImageInfo, error) {
	return m.Client.PullImage(ctx, m.Name, PullImageRequest{
		Image:       image,
		OCIPlatform: ociPlatform,
	})
}

// =========================================================================
// Files
// =========================================================================

// UploadFile writes data to path inside the machine.
func (m *Machine) UploadFile(ctx context.Context, path string, data []byte) (*FileUploadResponse, error) {
	return m.Client.UploadFile(ctx, m.Name, path, data)
}

// DownloadFile reads the file at path from inside the machine into memory.
func (m *Machine) DownloadFile(ctx context.Context, path string) ([]byte, error) {
	return m.Client.DownloadFile(ctx, m.Name, path)
}

// DownloadFileStream returns a streaming reader for path inside the machine.
// The caller owns the returned io.ReadCloser.
func (m *Machine) DownloadFileStream(ctx context.Context, path string) (io.ReadCloser, error) {
	return m.Client.DownloadFileStream(ctx, m.Name, path)
}

// Resize expands the machine's storage and/or overlay disks.
func (m *Machine) Resize(ctx context.Context, req ResizeMachineRequest) (*MachineInfo, error) {
	info, err := m.Client.ResizeMachine(ctx, m.Name, req)
	if err != nil {
		return nil, err
	}
	m.info.Store(info)
	return info, nil
}

// =========================================================================
// Helper functions
// =========================================================================

// WithMachine creates a machine, runs fn, and ensures the machine is stopped
// and deleted afterwards even on error or panic. This is the recommended
// pattern for short-lived workloads.
func WithMachine(ctx context.Context, config Config, fn func(ctx context.Context, m *Machine) error) (err error) {
	m, err := CreateMachine(ctx, config)
	if err != nil {
		return err
	}
	defer func() {
		// Use a fresh context so cleanup runs even when ctx is cancelled.
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Stop, then delete. Errors from cleanup are joined with the caller's err.
		if stopErr := m.Stop(cleanupCtx); stopErr != nil && !errors.Is(stopErr, ErrNotFound) {
			err = errors.Join(err, fmt.Errorf("stop machine: %w", stopErr))
		}
		if delErr := m.Delete(cleanupCtx); delErr != nil && !errors.Is(delErr, ErrNotFound) {
			err = errors.Join(err, fmt.Errorf("delete machine: %w", delErr))
		}
	}()
	return fn(ctx, m)
}

// QuickExec creates an ephemeral machine, runs command in the VM, and cleans
// up. Optional options come from the first ExecOptions and Config in the
// variadic slice; pass at most one of each.
func QuickExec(ctx context.Context, command []string, config Config, opts ...ExecOptions) (*ExecResult, error) {
	if config.Name == "" {
		config.Name = GenerateMachineName("quick-exec")
	}
	o := mergeExecOpts(opts)
	var result *ExecResult
	err := WithMachine(ctx, config, func(ctx context.Context, m *Machine) error {
		r, err := m.Exec(ctx, command, o)
		if err != nil {
			return err
		}
		result = r
		return nil
	})
	return result, err
}

// QuickRun creates an ephemeral machine, runs command in image, and cleans up.
func QuickRun(ctx context.Context, image string, command []string, config Config, opts ...ExecOptions) (*ExecResult, error) {
	if config.Name == "" {
		config.Name = GenerateMachineName("quick-run")
	}
	o := mergeExecOpts(opts)
	var result *ExecResult
	err := WithMachine(ctx, config, func(ctx context.Context, m *Machine) error {
		r, err := m.Run(ctx, image, command, o)
		if err != nil {
			return err
		}
		result = r
		return nil
	})
	return result, err
}

// =========================================================================
// Internal helpers
// =========================================================================

func envVarSlice(env map[string]string) []EnvVar {
	if len(env) == 0 {
		return nil
	}
	out := make([]EnvVar, 0, len(env))
	for k, v := range env {
		out = append(out, EnvVar{Name: k, Value: v})
	}
	return out
}

func timeoutSecsPtr(seconds int) *int64 {
	if seconds <= 0 {
		return nil
	}
	v := int64(seconds)
	return &v
}

func mergeExecOpts(opts []ExecOptions) ExecOptions {
	if len(opts) == 0 {
		return ExecOptions{}
	}
	return opts[0]
}

// GenerateMachineName produces a short, unique machine name with a random
// suffix to avoid collisions across rapid concurrent calls. Unix socket paths
// have a tight length limit, so the suffix is kept short (8 hex chars).
func GenerateMachineName(prefix string) string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand should never fail on supported platforms; fall back to a
		// time-based suffix so the name is still produced.
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano()%1_000_000_000)
	}
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b[:]))
}
