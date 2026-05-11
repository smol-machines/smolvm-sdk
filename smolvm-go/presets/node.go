package presets

import (
	"context"
	"path/filepath"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

// DefaultNodeImage is the OCI image used by Node helpers when none is provided.
const DefaultNodeImage = "node:22-alpine"

// NodeOptions controls the Node.js preset helpers.
type NodeOptions struct {
	// Name is the machine name (auto-generated when empty).
	Name string
	// ServerURL overrides the default smolvm server.
	ServerURL string
	// Image is the Node image (defaults to DefaultNodeImage).
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

// NodeCode runs the given JavaScript source in an ephemeral machine.
// The default image is node:22-alpine.
func NodeCode(ctx context.Context, code string, opts NodeOptions) (*smolvm.ExecResult, error) {
	return runImage(ctx, opts.machineConfig(), opts.image(), opts.OCIPlatform,
		[]string{"node", "-e", code}, smolvm.ExecOptions{Timeout: opts.Timeout})
}

// NodeFile runs a host-side JavaScript file inside an ephemeral machine.
// The file's directory is mounted at /workspace.
func NodeFile(ctx context.Context, hostPath string, opts NodeOptions) (*smolvm.ExecResult, error) {
	abs, err := filepath.Abs(hostPath)
	if err != nil {
		return nil, err
	}
	dir, file := filepath.Split(abs)

	cfg := opts.machineConfig()
	cfg.Mounts = append(cfg.Mounts, smolvm.MountSpec{Source: filepath.Clean(dir), Target: "/workspace"})

	return runImage(ctx, cfg, opts.image(), opts.OCIPlatform,
		[]string{"node", "/workspace/" + file},
		smolvm.ExecOptions{Timeout: opts.Timeout, Workdir: "/workspace"})
}

// NpmRun runs `npm run <script>` against a host-side project directory in an
// ephemeral machine. The project directory is mounted at /workspace and used
// as the working directory.
func NpmRun(ctx context.Context, projectDir, script string, opts NodeOptions) (*smolvm.ExecResult, error) {
	abs, err := filepath.Abs(projectDir)
	if err != nil {
		return nil, err
	}

	cfg := opts.machineConfig()
	cfg.Mounts = append(cfg.Mounts, smolvm.MountSpec{Source: abs, Target: "/workspace"})

	return runImage(ctx, cfg, opts.image(), opts.OCIPlatform,
		[]string{"npm", "run", script},
		smolvm.ExecOptions{Timeout: opts.Timeout, Workdir: "/workspace"})
}

func (o NodeOptions) image() string {
	if o.Image != "" {
		return o.Image
	}
	return DefaultNodeImage
}

func (o NodeOptions) machineConfig() smolvm.Config {
	return smolvm.Config{
		Name:      o.Name,
		ServerURL: o.ServerURL,
		Mounts:    append([]smolvm.MountSpec(nil), o.Mounts...),
		CPUs:      o.CPUs,
		MemoryMB:  o.MemoryMB,
		Network:   true, // required for image pull and most workloads
	}
}
