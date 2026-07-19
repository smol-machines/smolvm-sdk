package smolvm

// MountSpec is a host-to-VM volume mount.
type MountSpec struct {
	Source   string `json:"source"`
	Target   string `json:"target"`
	Readonly bool   `json:"readonly,omitempty"`
}

// PortSpec is a host-to-VM port forward (TCP).
type PortSpec struct {
	Host  int `json:"host"`
	Guest int `json:"guest"`
}

// MountInfo is a mount as reported by the server, including the virtiofs tag.
type MountInfo struct {
	Tag      string `json:"tag"`
	Source   string `json:"source"`
	Target   string `json:"target"`
	Readonly bool   `json:"readonly"`
}

// EnvVar is a single environment variable.
type EnvVar struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// MachineState represents the lifecycle state of a machine.
type MachineState string

const (
	MachineStateCreated MachineState = "created"
	MachineStateRunning MachineState = "running"
	MachineStateStopped MachineState = "stopped"
)

// MachineInfo describes a machine returned by the server.
type MachineInfo struct {
	Name      string       `json:"name"`
	State     MachineState `json:"state"`
	CPUs      int          `json:"cpus"`
	MemoryMB  int          `json:"memoryMb"`
	Mounts    []MountInfo  `json:"mounts"`
	Ports     []PortSpec   `json:"ports"`
	Network   bool         `json:"network"`
	CreatedAt int64        `json:"createdAt"` // Unix epoch seconds
	PID       *int         `json:"pid,omitempty"`
	StorageGB *int64       `json:"storageGb,omitempty"`
	OverlayGB *int64       `json:"overlayGb,omitempty"`
}

// ImageInfo describes an OCI image inside a machine.
type ImageInfo struct {
	Reference    string `json:"reference"`
	Digest       string `json:"digest"`
	Size         int64  `json:"size"`
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
	LayerCount   int    `json:"layerCount"`
}

// HealthResponse is the body returned by GET /health.
type HealthResponse struct {
	Status        string                 `json:"status"`
	Version       string                 `json:"version"`
	Machines      *MachineCountsResponse `json:"machines,omitempty"`
	UptimeSeconds *int64                 `json:"uptime_seconds,omitempty"`
}

// MachineCountsResponse is the machine summary in HealthResponse.
type MachineCountsResponse struct {
	Total   int `json:"total"`
	Running int `json:"running"`
}

// CapacityResponse is the body returned by GET /capacity: live node
// allocations and real utilization across all running machines on the host.
//
// Its JSON keys are snake_case (allocated_cpus, used_disk_gb, …), not the
// camelCase used by most responses: the server's CapacityResponse derives
// Serialize with no rename attribute, so serde emits the Rust field names
// verbatim. HealthResponse (uptime_seconds) is the other response that does
// this; everything else carries serde(rename_all = "camelCase").
type CapacityResponse struct {
	// AllocatedCPUs is the sum of per-machine vCPU requests for running machines.
	AllocatedCPUs int `json:"allocated_cpus"`
	// AllocatedMemoryMB is memory (MiB) allocated to running machines.
	AllocatedMemoryMB int64 `json:"allocated_memory_mb"`
	// UsedCPUs is the real fractional CPU load across VM processes.
	UsedCPUs float64 `json:"used_cpus"`
	// UsedMemoryMB is real resident memory (MiB) across VM processes.
	UsedMemoryMB int64 `json:"used_memory_mb"`
	// UsedDiskGB is real disk (GiB) consumed by VM storage + overlay files.
	UsedDiskGB int64 `json:"used_disk_gb"`
}

// RestartSpec is the restart policy for a machine, applied at creation time.
type RestartSpec struct {
	// Policy is one of "never", "always", "on-failure", "unless-stopped".
	Policy string `json:"policy,omitempty"`
	// MaxRetries caps restart attempts (0 = unlimited); nil leaves it unset.
	MaxRetries *int `json:"maxRetries,omitempty"`
}

// CreateMachineRequest is the body for POST /api/v1/machines.
//
// Resource fields (CPUs, MemoryMB, Network, StorageGB, OverlayGB, AllowedCidrs)
// are sent flat at the top level — the server does not accept a nested
// `resources` object on this endpoint.
//
// Image, From, and RegistryRef are mutually exclusive image sources.
type CreateMachineRequest struct {
	Name                  string       `json:"name,omitempty"`
	Image                 string       `json:"image,omitempty"`
	From                  string       `json:"from,omitempty"`
	RegistryRef           string       `json:"registryRef,omitempty"`
	RegistryIdentityToken string       `json:"registryIdentityToken,omitempty"`
	Mounts                []MountSpec  `json:"mounts,omitempty"`
	Ports                 []PortSpec   `json:"ports,omitempty"`
	CPUs                  int          `json:"cpus,omitempty"`
	MemoryMB              int          `json:"memoryMb,omitempty"`
	Network               bool         `json:"network,omitempty"`
	GPU                   bool         `json:"gpu,omitempty"`
	StorageGB             *int64       `json:"storageGb,omitempty"`
	OverlayGB             *int64       `json:"overlayGb,omitempty"`
	AllowedCidrs          []string     `json:"allowedCidrs,omitempty"`
	Restart               *RestartSpec `json:"restart,omitempty"`
}

// ExecRequest is the body for POST /api/v1/machines/{name}/exec and exec/stream.
//
// Stdin is honoured by the synchronous /exec endpoint; the streaming
// /exec/stream endpoint ignores Stdin and Background.
type ExecRequest struct {
	Command     []string `json:"command"`
	Env         []EnvVar `json:"env,omitempty"`
	Workdir     string   `json:"workdir,omitempty"`
	TimeoutSecs *int64   `json:"timeoutSecs,omitempty"`
	Stdin       string   `json:"stdin,omitempty"`
	// Background runs the command detached: the server spawns it and returns
	// its PID in stdout immediately instead of waiting for it to exit.
	Background bool `json:"background,omitempty"`
}

// RunRequest is the body for POST /api/v1/machines/{name}/run.
type RunRequest struct {
	Image       string   `json:"image"`
	Command     []string `json:"command"`
	Env         []EnvVar `json:"env,omitempty"`
	Workdir     string   `json:"workdir,omitempty"`
	TimeoutSecs *int64   `json:"timeoutSecs,omitempty"`
}

// ExecResponse is the result of a synchronous exec or run call.
//
// stdout and stderr are UTF-8; non-UTF-8 bytes are replaced with U+FFFD
// (a JSON-over-HTTP limitation, not smolvm itself).
type ExecResponse struct {
	ExitCode int    `json:"exitCode"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

// PullImageRequest is the body for POST /api/v1/machines/{name}/images/pull.
type PullImageRequest struct {
	Image       string `json:"image"`
	OCIPlatform string `json:"ociPlatform,omitempty"`
	// Proxy sets HTTP_PROXY/HTTPS_PROXY for the in-VM registry client.
	Proxy string `json:"proxy,omitempty"`
	// NoProxy is a comma-separated NO_PROXY list of hosts/CIDRs to bypass Proxy.
	NoProxy string `json:"noProxy,omitempty"`
}

// PullImageResponse wraps the pulled image info.
type PullImageResponse struct {
	Image ImageInfo `json:"image"`
}

// ListMachinesResponse is the body of GET /api/v1/machines.
type ListMachinesResponse struct {
	Machines []MachineInfo `json:"machines"`
}

// ListImagesResponse is the body of GET /api/v1/machines/{name}/images.
type ListImagesResponse struct {
	Images []ImageInfo `json:"images"`
}

// DeleteResponse is the body of DELETE /api/v1/machines/{name}.
type DeleteResponse struct {
	Deleted string `json:"deleted"`
}

// StartResponse is the body of POST /...start endpoints.
type StartResponse struct {
	Started string `json:"started"`
}

// StopResponse is the body of POST /...stop endpoints.
type StopResponse struct {
	Stopped string `json:"stopped"`
}

// FileUploadResponse is the body of PUT /api/v1/machines/{name}/files/{path}.
type FileUploadResponse struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// ResizeMachineRequest is the body for POST /api/v1/machines/{name}/resize.
type ResizeMachineRequest struct {
	StorageGB *int64 `json:"storageGb,omitempty"`
	OverlayGB *int64 `json:"overlayGb,omitempty"`
}

// LogsQuery is the query parameter set for GET /api/v1/machines/{name}/logs.
type LogsQuery struct {
	Follow bool
	Tail   *int
	Format string
}

// ApiErrorResponse is the body returned for non-2xx responses.
type ApiErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// Config is the high-level configuration for a Machine.
type Config struct {
	// Name is the unique machine name. Required.
	Name string

	// ServerURL is the smolvm server URL (default: http://127.0.0.1:8080).
	ServerURL string

	// Mounts configures host-to-VM volume mounts.
	Mounts []MountSpec

	// Ports configures host-to-VM port forwards.
	Ports []PortSpec

	// Image is an optional OCI image reference. Mutually exclusive with From.
	Image string

	// From is an optional path to a .smolmachine artifact. Mutually exclusive with Image.
	From string

	// CPUs sets the number of vCPUs (server default: 4).
	CPUs int

	// MemoryMB sets memory in MiB (server default: 8192).
	MemoryMB int

	// Network enables outbound TCP/UDP. ICMP is not supported.
	Network bool

	// StorageGB optionally overrides the storage disk size (default: 20).
	StorageGB *int64

	// OverlayGB optionally overrides the overlay disk size (default: 10).
	OverlayGB *int64

	// AllowedCidrs restricts egress to the given CIDR ranges.
	AllowedCidrs []string

	// GPU enables GPU acceleration (Vulkan via virtio-gpu).
	GPU bool

	// Restart sets the machine's restart policy.
	Restart *RestartSpec

	// RegistryRef pulls a .smolmachine artifact from a registry before
	// creating the VM. Mutually exclusive with Image and From.
	RegistryRef string

	// RegistryIdentityToken is a bearer credential (an OCI Distribution
	// identity_token) presented when pulling a private RegistryRef.
	RegistryIdentityToken string

	// HTTPClient is an optional override for the underlying *http.Client.
	HTTPClient HTTPClient
}

// LogsOptions controls log streaming behaviour.
type LogsOptions struct {
	Follow bool
	Tail   *int
}

// ExecOptions controls a single exec/run call.
type ExecOptions struct {
	Env     map[string]string
	Workdir string
	Timeout int // seconds; 0 means "no client-side limit beyond default"
	// Stdin is piped to the command's standard input (synchronous exec only).
	Stdin string
}
