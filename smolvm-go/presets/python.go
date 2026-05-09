// Package presets provides convenience helpers for running common workloads
// (Python, Node.js) inside ephemeral smolvm machines.
package presets

import (
	"context"
	"path/filepath"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

// DefaultPythonImage is the OCI image used by Python helpers when none is provided.
const DefaultPythonImage = "python:3.12-alpine"

// PythonOptions controls the Python preset helpers.
type PythonOptions struct {
	// Name is the machine name (auto-generated when empty).
	Name string
	// ServerURL overrides the default smolvm server.
	ServerURL string
	// Image is the Python image (defaults to DefaultPythonImage).
	Image string
	// Mounts to attach to the underlying machine.
	Mounts []smolvm.MountSpec
	// CPUs sets the vCPU count (server default applies when 0).
	CPUs int
	// MemoryMB sets memory in MiB (server default applies when 0).
	MemoryMB int
	// Timeout caps the inner command execution in seconds (0 = no cap).
	Timeout int
	// OCIPlatform overrides the platform used during the image pull (e.g. "linux/arm64").
	OCIPlatform string
}

// PythonCode runs the given Python source in an ephemeral machine and
// returns the result. The default image is python:3.12-alpine.
func PythonCode(ctx context.Context, code string, opts PythonOptions) (*smolvm.ExecResult, error) {
	return runImage(ctx, opts.machineConfig(), opts.image(), opts.OCIPlatform,
		[]string{"python", "-c", code}, smolvm.ExecOptions{Timeout: opts.Timeout})
}

// PythonFile runs a host-side Python file inside an ephemeral machine. The
// file's directory is mounted at /workspace. The default image is
// python:3.12-alpine.
func PythonFile(ctx context.Context, hostPath string, opts PythonOptions) (*smolvm.ExecResult, error) {
	abs, err := filepath.Abs(hostPath)
	if err != nil {
		return nil, err
	}
	dir, file := filepath.Split(abs)

	cfg := opts.machineConfig()
	cfg.Mounts = append(cfg.Mounts, smolvm.MountSpec{Source: filepath.Clean(dir), Target: "/workspace"})

	return runImage(ctx, cfg, opts.image(), opts.OCIPlatform,
		[]string{"python", "/workspace/" + file},
		smolvm.ExecOptions{Timeout: opts.Timeout, Workdir: "/workspace"})
}

// Pip installs the given packages into a new ephemeral machine. Returns the
// pip output as an ExecResult.
func Pip(ctx context.Context, packages []string, opts PythonOptions) (*smolvm.ExecResult, error) {
	cmd := append([]string{"pip", "install"}, packages...)
	return runImage(ctx, opts.machineConfig(), opts.image(), opts.OCIPlatform,
		cmd, smolvm.ExecOptions{Timeout: opts.Timeout})
}

func (o PythonOptions) image() string {
	if o.Image != "" {
		return o.Image
	}
	return DefaultPythonImage
}

func (o PythonOptions) machineConfig() smolvm.Config {
	return smolvm.Config{
		Name:      o.Name,
		ServerURL: o.ServerURL,
		Mounts:    append([]smolvm.MountSpec(nil), o.Mounts...),
		CPUs:      o.CPUs,
		MemoryMB:  o.MemoryMB,
		Network:   true, // required for image pull and most workloads
	}
}
