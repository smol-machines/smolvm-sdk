interface components {
    schemas: {
        /** @description API error response. */
        ApiErrorResponse: {
            /**
             * @description Error code.
             * @example NOT_FOUND
             */
            code: string;
            /**
             * @description Error message.
             * @example machine 'test' not found
             */
            error: string;
        };
        /**
         * @description Live node capacity: current allocations and real utilization across all
         *     running machines on this host. Read-only introspection — a fleet control
         *     plane (or any operator) polls this to gauge node load. The reporter owns
         *     totals/reserved; this endpoint reports only what the runtime itself knows.
         */
        CapacityResponse: {
            /**
             * Format: int32
             * @description CPUs allocated to running machines (sum of per-machine cpu requests).
             */
            allocated_cpus: number;
            /**
             * Format: int64
             * @description Memory (MB) allocated to running machines.
             */
            allocated_memory_mb: number;
            /**
             * @description Opaque id minted once per serve process. It changes iff the serve restarts
             *     — the signal the control uses to detect that this node's warm pool (and any
             *     in-memory VM state) was wiped, so it can prune the now-stale pool records.
             */
            boot_id?: string;
            /**
             * Format: double
             * @description Real fractional CPU load across VM processes (e.g. 2.5 = 2.5 CPUs).
             */
            used_cpus: number;
            /**
             * Format: int64
             * @description Real disk (GB) consumed by VM storage + overlay files.
             */
            used_disk_gb: number;
            /**
             * Format: int64
             * @description Real resident memory (MB) across VM processes.
             */
            used_memory_mb: number;
        };
        /** @description Request to create a new machine. */
        CreateMachineRequest: {
            /** @description Allowed egress CIDR ranges. */
            allowedCidrs?: string[] | null;
            /**
             * @description Allowed egress hostnames (and their subdomains); DNS answers for these
             *     names are learned into the egress allow-list.
             */
            allowedHosts?: string[] | null;
            /**
             * @description Brokered P2P blob peers: node base URLs (`https://<addr>:<port>`) supplied
             *     by the control plane. On a cache miss the layer blob is fetched from a
             *     peer's `GET /p2p/blob/<digest>` (over node→node mTLS) before the registry.
             *     Empty (the default) ⇒ registry-only, byte-for-byte as before.
             */
            blobPeers?: string[];
            /** @description Workload command run when the machine starts (see `entrypoint`). */
            cmd?: string[];
            /**
             * Format: int32
             * @description Number of vCPUs.
             * @example 4
             */
            cpus?: number | null;
            /** @description Enable CUDA remoting (host NVIDIA GPU via the bundled shims). */
            cuda?: boolean;
            /**
             * @description Expose the guest's Docker daemon socket to the host as a Unix socket in
             *     the VM data dir, so a host client can drive it with `DOCKER_HOST=unix://…`.
             *     Off by default.
             */
            dockerSocket?: boolean;
            /**
             * @description Workload entrypoint. With `cmd`, overrides the image's (or the
             *     `.smolmachine` artifact's) own entrypoint+cmd, matching the CLI's
             *     `machine create -- <command>` precedence. Empty = use the image's.
             */
            entrypoint?: string[];
            /**
             * @description Environment variables for the machine's workload (init commands and the
             *     entrypoint). For `from`/`registry_ref` machines these layer on top of
             *     the artifact manifest's env; a request variable wins on name collision.
             */
            env?: components["schemas"]["EnvVar"][];
            /**
             * @description Path to a .smolmachine sidecar file. Creates the machine from pre-packed
             *     layers instead of pulling from a registry. Mutually exclusive with `image`.
             */
            from?: string | null;
            /** @description Enable GPU acceleration (Vulkan via virtio-gpu). */
            gpu?: boolean;
            /** @description OCI image reference (e.g., "alpine:latest"). Mutually exclusive with `from`. */
            image?: string | null;
            /**
             * Format: int32
             * @description Memory in MiB.
             * @example 8192
             */
            memoryMb?: number | null;
            /** @description Host mounts to attach. */
            mounts?: components["schemas"]["MountSpec"][];
            /**
             * @description Machine name. Auto-generated if omitted.
             * @example my-vm
             */
            name?: string | null;
            /**
             * @description Enable outbound network access (TSI).
             *     Note: Only TCP/UDP supported, not ICMP (ping).
             */
            network?: boolean;
            networkBackend?: null | components["schemas"]["NetworkBackend"];
            /**
             * Format: int64
             * @description Overlay disk size in GiB (default: 10).
             */
            overlayGb?: number | null;
            /** @description Port mappings (host:guest). */
            ports?: components["schemas"]["PortSpec"][];
            /**
             * @description Bearer credential (an OCI Distribution `identity_token`) to present when
             *     pulling `registry_ref`. The control plane supplies a short-lived,
             *     tenant-scoped token here so a node can fetch a tenant's private
             *     `.smolmachine`. Takes precedence over any persisted registry credential.
             */
            registryIdentityToken?: string | null;
            /**
             * @description Registry reference to a .smolmachine artifact (e.g., "myapp:v1").
             *     Pulls from the registry before creating the VM.
             *     Mutually exclusive with `image` and `from`.
             */
            registryRef?: string | null;
            restart?: null | components["schemas"]["RestartSpec"];
            /**
             * @description Secret refs attached to the machine. Resolved at every
             *     subsequent exec against the host's env/files. Rejected unless empty;
             *     accepted — `from_env`/`from_file` on the API surface would let
             *     an untrusted caller exfiltrate the server process's env or
             *     read arbitrary host files; use the CLI `machine create` path
             *     for those source kinds.
             */
            secrets?: Record<string, never>;
            /**
             * Format: int64
             * @description Storage disk size in GiB (default: 20).
             */
            storageGb?: number | null;
            /**
             * @description Working directory for the machine's workload. Overrides the artifact
             *     manifest's workdir when set.
             */
            workdir?: string | null;
        };
        /** @description Query parameters for delete machine endpoint. */
        DeleteQuery: {
            /**
             * @description If true, force delete even if stop fails and VM is still running.
             *     This may orphan the VM process. Default: false.
             */
            force?: boolean;
        };
        /** @description Generic delete response. */
        DeleteResponse: {
            /**
             * @description Name of deleted resource.
             * @example my-machine
             */
            deleted: string;
        };
        /** @description Environment variable. */
        EnvVar: {
            /**
             * @description Variable name.
             * @example MY_VAR
             */
            name: string;
            /**
             * @description Variable value.
             * @example my_value
             */
            value: string;
        };
        /** @description Request to execute a command in a machine. */
        ExecRequest: {
            /**
             * @description Run the command detached: spawn it in the background and return its PID
             *     immediately instead of waiting. The process keeps running (a long-lived
             *     daemon — dev server, agent runner) until it exits or the machine stops.
             */
            background?: boolean;
            /**
             * @description Command and arguments.
             * @example [
             *       "echo",
             *       "hello"
             *     ]
             */
            command: string[];
            /** @description Environment variables. */
            env?: components["schemas"]["EnvVar"][];
            /**
             * @description Ad-hoc secret refs. Rejected unless empty: an untrusted HTTP
             *     caller cannot read this host's env/files. See `RequestSecretRefs`.
             */
            secrets?: Record<string, never>;
            /** @description Data to pipe to the command's stdin. */
            stdin?: string | null;
            /**
             * Format: int64
             * @description Timeout in seconds.
             * @example 30
             */
            timeoutSecs?: number | null;
            /**
             * @description Working directory.
             * @example /workspace
             */
            workdir?: string | null;
        };
        /**
         * @description Command execution result.
         *
         *     **Encoding note**: `stdout`/`stderr` are a lossy UTF-8 view (non-UTF-8 bytes
         *     become U+FFFD) kept for older clients. `stdoutB64`/`stderrB64` carry the raw,
         *     byte-exact output (base64) and should be preferred by callers that need
         *     binary-safe results (image bytes, tarballs, etc.) — the agent preserves
         *     bytes end-to-end and these fields do too.
         */
        ExecResponse: {
            /**
             * Format: int32
             * @description Exit code.
             * @example 0
             */
            exitCode: number;
            /**
             * @description Standard error, lossy UTF-8 (non-UTF-8 bytes → U+FFFD). Prefer `stderrB64`.
             * @example
             */
            stderr: string;
            /** @description Raw stderr bytes, base64-encoded — byte-exact, binary-safe. */
            stderrB64: string;
            /**
             * @description Standard output, lossy UTF-8 (non-UTF-8 bytes → U+FFFD). Prefer `stdoutB64`.
             * @example hello
             */
            stdout: string;
            /** @description Raw stdout bytes, base64-encoded — byte-exact, binary-safe. */
            stdoutB64: string;
        };
        /**
         * @description Request to export a stopped machine to a `.smolmachine` and push it to a
         *     registry. The control plane mints a pre-scoped OCI bearer (`push_token`)
         *     that authorizes the write against `reference_host`.
         */
        ExportRequest: {
            /** @description Pre-scoped OCI bearer token minted by the control plane. */
            pushToken: string;
            /**
             * @description Registry host to push to (e.g. `registry.smolmachines.com`).
             * @example registry.smolmachines.com
             */
            referenceHost: string;
            /**
             * @description Repository to push into (e.g. `tenant/my-machine`).
             * @example tenant/my-machine
             */
            repo: string;
            /**
             * @description Tag to push under (e.g. `latest`).
             * @example latest
             */
            tag: string;
        };
        /** @description Result of exporting a machine to a registry. */
        ExportResponse: {
            /**
             * @description Digest of the pushed OCI manifest (reference as `repo@<digest>`).
             * @example sha256:abc123
             */
            digest: string;
            /** @description The `PackManifest` JSON carried in the sidecar footer. */
            manifest: string;
            /**
             * @description Host platform the artifact targets (e.g. `linux/amd64`).
             * @example linux/amd64
             */
            platform: string;
            /**
             * Format: int64
             * @description Size of the `.smolmachine` sidecar blob in bytes.
             * @example 104857600
             */
            sizeBytes: number;
        };
        /** @description Response from file upload. */
        FileUploadResponse: {
            /** @description Path where the file was written. */
            path: string;
            /**
             * Format: int64
             * @description Size of the file in bytes.
             */
            size: number;
        };
        /** @description Request to fork a running, forkable golden machine into a new clone. */
        ForkRequest: {
            /**
             * @description Name for the new clone machine.
             * @example clone-1
             */
            name: string;
            /**
             * @description Pin the clone's inbound port forwards. Without this, the golden's
             *     forwards are remapped to freshly-allocated host ports so the clone does
             *     not collide with the still-running golden or sibling clones.
             */
            ports?: components["schemas"]["PortSpec"][];
            /**
             * @description Share the golden's loaded CUDA weights with this clone instead of
             *     copying them (one base copy in VRAM across sibling clones). Correct when
             *     the base stays frozen (LoRA/QLoRA fine-tuning, inference).
             */
            shareWeights?: boolean;
        };
        /** @description Health check response. */
        HealthResponse: {
            machines?: null | components["schemas"]["MachineCountsResponse"];
            /**
             * @description Health status (e.g., "ok").
             * @example ok
             */
            status: string;
            /**
             * Format: int64
             * @description Server uptime in seconds.
             */
            uptime_seconds?: number | null;
            /**
             * @description Server version.
             * @example 0.5.2
             */
            version: string;
        };
        /** @description Image information. */
        ImageInfo: {
            /**
             * @description Architecture.
             * @example arm64
             */
            architecture: string;
            /**
             * @description Image digest.
             * @example sha256:abc123...
             */
            digest: string;
            /**
             * @description Number of layers.
             * @example 3
             */
            layerCount: number;
            /**
             * @description OS.
             * @example linux
             */
            os: string;
            /**
             * @description Image reference.
             * @example alpine:latest
             */
            reference: string;
            /**
             * Format: int64
             * @description Size in bytes.
             * @example 7500000
             */
            size: number;
        };
        /** @description List images response. */
        ListImagesResponse: {
            /** @description List of images. */
            images: components["schemas"]["ImageInfo"][];
        };
        /** @description List machines response. */
        ListMachinesResponse: {
            /** @description List of machines. */
            machines: components["schemas"]["MachineInfo"][];
        };
        /** @description Query parameters for logs endpoint. */
        LogsQuery: {
            /** @description If true, follow the logs (like tail -f). Default: false. */
            follow?: boolean;
            /** @description Output format: "raw" (default) or "json" (only emit valid JSON lines). */
            format?: string | null;
            /**
             * @description Number of lines to show from the end (like tail -n). Default: all.
             * @example 100
             */
            tail?: number | null;
        };
        /** @description Machine counts for health response. */
        MachineCountsResponse: {
            /** @description Currently running machines. */
            running: number;
            /** @description Total machines in the database. */
            total: number;
        };
        /** @description Request to execute a command in a machine. */
        MachineExecRequest: {
            /**
             * @description Command and arguments.
             * @example [
             *       "echo",
             *       "hello"
             *     ]
             */
            command: string[];
            /** @description Environment variables. */
            env?: components["schemas"]["EnvVar"][];
            /** @description Ad-hoc secret refs. Rejected unless empty (untrusted scope). */
            secrets?: Record<string, never>;
            /** @description Data to pipe to the command's stdin. */
            stdin?: string | null;
            /**
             * Format: int64
             * @description Timeout in seconds.
             */
            timeoutSecs?: number | null;
            /** @description Working directory. */
            workdir?: string | null;
        };
        /** @description Machine status information. */
        MachineInfo: {
            /** @description Allowed egress CIDRs. Omitted when unrestricted; an empty list denies all. */
            allowedCidrs?: string[] | null;
            /** @description Allowed egress hostnames. Omitted when unset. Echoes back what `create` accepted. */
            allowedHosts?: string[] | null;
            /**
             * Format: int64
             * @description Same consumed CPU but in MILLISECONDS — sub-second precision so consumers
             *     integrating this don't quantize a barely-busy process up to a whole second.
             *     Derived from the same nanosecond sample as `cpu_seconds`. Omitted for
             *     stopped machines (no live process to sample).
             * @example 42830
             */
            cpuMillis?: number | null;
            /**
             * Format: int64
             * @description Consumed CPU-seconds (user+system) of the machine's CURRENT VMM process,
             *     sampled live from the host. Resets to 0 on a VM restart — it's a stateless
             *     snapshot; the control plane accumulates a durable total from it. Omitted
             *     for stopped machines (no live process to sample).
             * @example 42
             */
            cpuSeconds?: number | null;
            /**
             * Format: int32
             * @description Number of vCPUs.
             * @example 2
             */
            cpus: number;
            /**
             * Format: int64
             * @description Creation timestamp (seconds since Unix epoch).
             */
            createdAt: number;
            /**
             * Format: int64
             * @description Actual host disk consumed by this machine's data dir, in MiB (real blocks of
             *     the sparse disk images, not provisioned capacity). An instantaneous gauge the
             *     control integrates over time for active-disk billing. Omitted when the data
             *     dir can't be read.
             * @example 256
             */
            diskUsedMb?: number | null;
            /**
             * Format: int64
             * @description Cumulative guest-outbound (egress) bytes since boot, for billing. Present
             *     only for virtio-net machines that have reported a value; omitted for TSI
             *     or machines that haven't flushed yet. Surfaced the same way `storage_gb`
             *     is, so the control plane reads both from the machine list.
             * @example 1048576
             */
            egressBytes?: number | null;
            /**
             * Format: int32
             * @description Memory in MiB.
             * @example 1024
             */
            memoryMb: number;
            /** @description Configured mounts (with virtiofs tags for container use). */
            mounts: components["schemas"]["MountInfo"][];
            /**
             * @description Machine name.
             * @example my-vm
             */
            name: string;
            /** @description Whether outbound network access is enabled. */
            network: boolean;
            networkBackend?: null | components["schemas"]["NetworkBackend"];
            /**
             * Format: int64
             * @description Overlay disk size in GiB.
             * @example 2
             */
            overlayGb?: number | null;
            /**
             * Format: int32
             * @description Process ID (if running).
             * @example 12345
             */
            pid?: number | null;
            /** @description Configured port mappings. */
            ports: components["schemas"]["PortSpec"][];
            /**
             * Format: int64
             * @description Current resident memory (RSS) of the machine's VMM process, in MiB, sampled
             *     live from the host. Unlike CPU this is an instantaneous gauge (not a
             *     counter); the control plane integrates it over time for active-memory
             *     billing. Omitted for stopped machines (no live process to sample).
             * @example 128
             */
            rssMb?: number | null;
            /**
             * @description Current state ("created", "running", "stopped").
             * @example running
             */
            state: string;
            /**
             * Format: int64
             * @description Storage disk size in GiB.
             * @example 20
             */
            storageGb?: number | null;
        };
        /** @description Mount information (for responses, includes virtiofs tag). */
        MountInfo: {
            /** @description Read-only mount. */
            readonly: boolean;
            /**
             * @description Host path.
             * @example /Users/me/code
             */
            source: string;
            /**
             * @description Virtiofs tag (e.g., "smolvm0"). Use this in container mounts.
             * @example smolvm0
             */
            tag: string;
            /**
             * @description Path inside the machine.
             * @example /workspace
             */
            target: string;
        };
        /** @description Mount specification (for requests). */
        MountSpec: {
            /** @description Read-only mount. */
            readonly?: boolean;
            /**
             * @description Host path to mount.
             * @example /Users/me/code
             */
            source: string;
            /**
             * @description Path inside the machine.
             * @example /workspace
             */
            target: string;
        };
        /**
         * @description Network backend override for machine launch.
         * @enum {string}
         */
        NetworkBackend: "tsi" | "virtio-net";
        /** @description Port mapping specification. */
        PortSpec: {
            /**
             * Format: int32
             * @description Port inside the machine.
             * @example 80
             */
            guest: number;
            /**
             * Format: int32
             * @description Port on the host.
             * @example 8080
             */
            host: number;
        };
        /** @description Request to pull an image. */
        PullImageRequest: {
            /**
             * @description Image reference.
             * @example python:3.12-alpine
             */
            image: string;
            /**
             * @description Comma-separated NO_PROXY list of hosts/CIDRs that bypass the proxy.
             * @example 127.0.0.1,localhost,.internal
             */
            noProxy?: string | null;
            /**
             * @description OCI platform for multi-arch images (e.g., "linux/arm64").
             * @example linux/arm64
             */
            ociPlatform?: string | null;
            /**
             * @description Proxy URL applied to the in-VM registry client
             *     (sets HTTP_PROXY and HTTPS_PROXY).
             * @example http://192.168.127.254:3128
             */
            proxy?: string | null;
        };
        /** @description Pull image response. */
        PullImageResponse: {
            /** @description Information about the pulled image. */
            image: components["schemas"]["ImageInfo"];
        };
        /** @description Request to resize a machine's disk resources. */
        ResizeMachineRequest: {
            /**
             * Format: int64
             * @description Overlay disk size in GiB (expand only, optional).
             * @example 20
             */
            overlayGb?: number | null;
            /**
             * Format: int64
             * @description Storage disk size in GiB (expand only, optional).
             * @example 50
             */
            storageGb?: number | null;
        };
        /** @description VM resource specification. */
        ResourceSpec: {
            /**
             * @description Allowed egress CIDR ranges. When set, only these IP ranges are reachable.
             *     Omit for unrestricted egress. Empty list denies all egress.
             */
            allowedCidrs?: string[] | null;
            /**
             * @description Allowed egress hostnames. When set, DNS answers for these names (and their
             *     subdomains) are learned into the egress allow-list so the machine can reach
             *     them by name. Combine with `allowed_cidrs` to also permit fixed ranges.
             */
            allowedHosts?: string[] | null;
            /**
             * Format: int32
             * @description Number of vCPUs.
             * @example 2
             */
            cpus?: number | null;
            /**
             * @description Enable CUDA remoting (the guest sees the host NVIDIA GPU through the
             *     bundled shims). Required on a golden that fork clones will train on.
             */
            cuda?: boolean | null;
            /** @description Enable GPU acceleration (Vulkan via virtio-gpu). */
            gpu?: boolean | null;
            /**
             * Format: int32
             * @description Memory in MiB.
             * @example 1024
             */
            memoryMb?: number | null;
            /**
             * @description Enable outbound network access (TSI).
             *     Note: Only TCP/UDP supported, not ICMP (ping).
             */
            network?: boolean | null;
            networkBackend?: null | components["schemas"]["NetworkBackend"];
            /**
             * Format: int64
             * @description Overlay disk size in GiB (default: 10).
             * @example 10
             */
            overlayGb?: number | null;
            /**
             * Format: int64
             * @description Storage disk size in GiB (default: 20).
             * @example 20
             */
            storageGb?: number | null;
        };
        /** @description Restart policy specification for machine creation. */
        RestartSpec: {
            /**
             * Format: int32
             * @description Maximum restart attempts (0 = unlimited).
             */
            maxRetries?: number | null;
            /** @description Restart policy: "never", "always", "on-failure", "unless-stopped". */
            policy?: string | null;
        };
        /** @description Request to run a command in an image. */
        RunRequest: {
            /**
             * @description Command and arguments.
             * @example [
             *       "python",
             *       "-c",
             *       "print('hello')"
             *     ]
             */
            command: string[];
            /** @description Environment variables. */
            env?: components["schemas"]["EnvVar"][];
            /**
             * @description Image to run in.
             * @example python:3.12-alpine
             */
            image: string;
            /** @description Ad-hoc secret refs. Rejected unless empty (untrusted scope). */
            secrets?: Record<string, never>;
            /**
             * Format: int64
             * @description Timeout in seconds.
             */
            timeoutSecs?: number | null;
            /** @description Working directory. */
            workdir?: string | null;
        };
        /** @description Query string for `POST /machines/{name}/start`. */
        StartMachineQuery: {
            /**
             * @description Start as a fork base: back the guest RAM with a memfd (copy-on-write
             *     cloneable) and expose a control socket so the machine can later be forked
             *     with `POST /machines/{name}/fork`. The golden freezes after its first fork.
             */
            forkable?: boolean;
        };
        /** @description Generic start response. */
        StartResponse: {
            /**
             * @description Identifier of started resource.
             * @example abc123
             */
            started: string;
        };
        /** @description Generic stop response. */
        StopResponse: {
            /**
             * @description Identifier of stopped resource.
             * @example abc123
             */
            stopped: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}

type Schemas = components["schemas"];
type ApiErrorResponse = Schemas["ApiErrorResponse"];
type CreateMachineRequest = Schemas["CreateMachineRequest"];
type DeleteResponse = Schemas["DeleteResponse"];
type EnvVar = Schemas["EnvVar"];
type ExecRequest = Schemas["ExecRequest"];
type ExecResponse = Schemas["ExecResponse"];
type HealthResponse = Schemas["HealthResponse"];
type ImageInfo = Schemas["ImageInfo"];
type ListImagesResponse = Schemas["ListImagesResponse"];
type ListMachinesResponse = Schemas["ListMachinesResponse"];
type LogsQuery = Schemas["LogsQuery"];
type MachineExecRequest = Schemas["MachineExecRequest"];
type MachineInfo = Schemas["MachineInfo"];
type MountInfo = Schemas["MountInfo"];
type MountSpec = Schemas["MountSpec"];
type PortSpec = Schemas["PortSpec"];
type PullImageRequest = Schemas["PullImageRequest"];
type PullImageResponse = Schemas["PullImageResponse"];
type ResourceSpec = Schemas["ResourceSpec"];
type RunRequest = Schemas["RunRequest"];

/**
 * SmolvmClient - HTTP client for the smolvm API.
 *
 * This client uses types generated from the OpenAPI spec for type safety.
 */

/**
 * Low-level HTTP client for the smolvm API.
 *
 * Types are generated from the OpenAPI specification for guaranteed compatibility.
 */
declare class SmolvmClient {
    readonly baseUrl: string;
    constructor(baseUrl?: string);
    /**
     * Make an HTTP request to the API.
     */
    request<T>(method: string, path: string, body?: unknown, timeout?: number): Promise<T>;
    /**
     * Check server health.
     */
    health(): Promise<HealthResponse>;
    /**
     * Create a new machine.
     */
    createMachine(req: CreateMachineRequest): Promise<MachineInfo>;
    /**
     * List all machines.
     */
    listMachines(): Promise<MachineInfo[]>;
    /**
     * Get machine by name.
     */
    getMachine(name: string): Promise<MachineInfo>;
    /**
     * Start a machine.
     */
    startMachine(name: string): Promise<MachineInfo>;
    /**
     * Stop a machine.
     */
    stopMachine(name: string): Promise<MachineInfo>;
    /**
     * Delete a machine.
     *
     * @param name - Machine name
     * @param force - Force delete even if VM is still running (may orphan the process)
     */
    deleteMachine(name: string, force?: boolean): Promise<DeleteResponse>;
    /**
     * Execute a command in the machine VM.
     */
    exec(machine: string, req: ExecRequest, timeout?: number): Promise<ExecResponse>;
    /**
     * Run a command in a container image within the machine.
     */
    run(machine: string, req: RunRequest, timeout?: number): Promise<ExecResponse>;
    /**
     * Stream logs from a machine via SSE.
     */
    streamLogs(machine: string, query?: LogsQuery, signal?: AbortSignal): AsyncIterable<string>;
    /**
     * List images in a machine.
     */
    listImages(machine: string): Promise<ImageInfo[]>;
    /**
     * Pull an image into a machine.
     */
    pullImage(machine: string, req: PullImageRequest, timeout?: number): Promise<ImageInfo>;
    /**
     * Execute a command directly in a machine (VM-level, not container).
     */
    execMachine(name: string, req: MachineExecRequest, timeout?: number): Promise<ExecResponse>;
}

/**
 * Type definitions for smolvm SDK.
 *
 * API types are re-exported from the generated OpenAPI models.
 * SDK-specific types are defined here for ergonomic wrappers.
 */

/**
 * Configuration for creating a machine via the high-level SDK.
 */
interface MachineConfig {
    /** Unique name for the machine */
    name: string;
    /** Server URL (default: "http://127.0.0.1:8080") */
    serverUrl?: string;
    /** Host mounts to attach */
    mounts?: MountSpec[];
    /** Port mappings (host:guest) */
    ports?: PortSpec[];
    /** VM resource configuration */
    resources?: ResourceSpec;
}
/**
 * Machine state.
 */
type MachineState = "created" | "running" | "stopped";
/**
 * Options for command execution.
 */
interface ExecOptions {
    /** Environment variables as key-value pairs */
    env?: Record<string, string>;
    /** Working directory */
    workdir?: string;
    /** Timeout in seconds */
    timeout?: number;
}
/**
 * Options for log streaming.
 */
interface LogsOptions {
    /** Follow log output */
    follow?: boolean;
    /** Only return the last N lines */
    tail?: number;
}
/**
 * Options for code execution (extends ExecOptions).
 */
interface CodeOptions extends ExecOptions {
    /** Override default image */
    image?: string;
}

/**
 * Error thrown when assertSuccess() is called on a failed execution.
 */
declare class ExecutionError extends Error {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    constructor(exitCode: number, stdout: string, stderr: string);
}
/**
 * Rich result object from command execution.
 */
declare class ExecResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    constructor(response: ExecResponse);
    /**
     * Whether the command exited successfully (exit code 0).
     */
    get success(): boolean;
    /**
     * Combined stdout and stderr output.
     */
    get output(): string;
    /**
     * Assert that the command succeeded (exit code 0).
     * Throws ExecutionError if the command failed.
     * Returns this for method chaining.
     */
    assertSuccess(): this;
}

/**
 * High-level machine abstraction for managing microVM machines.
 */
declare class Machine {
    readonly name: string;
    readonly client: SmolvmClient;
    private config;
    private _info?;
    private _started;
    constructor(config: MachineConfig);
    /**
     * Create a new machine and start it.
     */
    static create(config: MachineConfig): Promise<Machine>;
    /**
     * Create and start the machine.
     * If the machine already exists, it will be started if not already running.
     */
    start(): Promise<void>;
    /**
     * Stop the machine.
     */
    stop(): Promise<void>;
    /**
     * Delete the machine.
     */
    delete(): Promise<void>;
    /**
     * Get the current machine status.
     */
    status(): Promise<MachineInfo>;
    /**
     * Whether the machine has been started.
     */
    get isStarted(): boolean;
    /**
     * Get the current machine state.
     */
    get state(): MachineState | undefined;
    /**
     * Get the machine mounts.
     */
    get mounts(): MountInfo[];
    /**
     * Get the raw machine info.
     */
    get info(): MachineInfo | undefined;
    /**
     * Execute a command directly in the machine VM.
     */
    exec(command: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Run a command in a container image within the machine.
     */
    run(image: string, command: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Stream logs from the machine.
     */
    logs(options?: LogsOptions): AsyncIterable<string>;
    /**
     * List all images in the machine.
     */
    listImages(): Promise<ImageInfo[]>;
    /**
     * Pull an image into the machine.
     */
    pullImage(image: string, ociPlatform?: string): Promise<ImageInfo>;
}
/**
 * Create a machine, run a function with it, and clean up afterwards.
 * This is the recommended way to use machines for short-lived tasks.
 */
declare function withMachine<T>(config: MachineConfig, fn: (machine: Machine) => Promise<T>): Promise<T>;
/**
 * Quick execution helper - creates a temporary machine, runs a command, and cleans up.
 */
declare function quickExec(command: string[], options?: Partial<MachineConfig> & ExecOptions): Promise<ExecResult>;
/**
 * Quick run helper - creates a temporary machine, runs in an image, and cleans up.
 */
declare function quickRun(image: string, command: string[], options?: Partial<MachineConfig> & ExecOptions): Promise<ExecResult>;

/**
 * Python-specific machine with convenience methods for running Python code.
 */
declare class PythonMachine extends Machine {
    static readonly DEFAULT_IMAGE = "python:3.12-alpine";
    /**
     * Create a new Python machine and start it.
     */
    static create(config: MachineConfig): Promise<PythonMachine>;
    /**
     * Run Python code directly.
     *
     * @param code - Python code to execute
     * @param options - Execution options
     */
    runCode(code: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Run a Python file.
     *
     * @param path - Path to the Python file (within the machine)
     * @param options - Execution options
     */
    runFile(path: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Install Python packages using pip.
     *
     * @param packages - Package names to install
     * @param options - Execution options
     */
    pip(packages: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Run Python in interactive REPL mode with initial code.
     * Useful for setting up an environment and then running code.
     *
     * @param setupCode - Code to run for setup
     * @param mainCode - Main code to execute
     * @param options - Execution options
     */
    runWithSetup(setupCode: string, mainCode: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Check Python version.
     */
    version(options?: CodeOptions): Promise<string>;
    /**
     * List installed packages.
     */
    listPackages(options?: ExecOptions): Promise<string[]>;
}

/**
 * Node.js-specific machine with convenience methods for running JavaScript/TypeScript.
 */
declare class NodeMachine extends Machine {
    static readonly DEFAULT_IMAGE = "node:22-alpine";
    /**
     * Create a new Node machine and start it.
     */
    static create(config: MachineConfig): Promise<NodeMachine>;
    /**
     * Run JavaScript code directly.
     *
     * @param code - JavaScript code to execute
     * @param options - Execution options
     */
    runCode(code: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Run a JavaScript file.
     *
     * @param path - Path to the JavaScript file (within the machine)
     * @param options - Execution options
     */
    runFile(path: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Run npm commands.
     *
     * @param args - Arguments to pass to npm
     * @param options - Execution options
     */
    npm(args: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Install npm packages.
     *
     * @param packages - Package names to install
     * @param options - Execution options
     */
    npmInstall(packages: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Run npx commands.
     *
     * @param args - Arguments to pass to npx
     * @param options - Execution options
     */
    npx(args: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Check Node.js version.
     */
    version(options?: CodeOptions): Promise<string>;
    /**
     * Run code with ES modules support.
     *
     * @param code - ES module code to execute
     * @param options - Execution options
     */
    runESM(code: string, options?: CodeOptions): Promise<ExecResult>;
    /**
     * Evaluate a JavaScript expression and return the result.
     *
     * @param expression - JavaScript expression to evaluate
     * @param options - Execution options
     */
    evaluate(expression: string, options?: CodeOptions): Promise<ExecResult>;
}

/**
 * Base error class for all smolvm SDK errors.
 */
declare class SmolvmError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(message: string, code: string, statusCode: number);
}
/**
 * Resource not found (HTTP 404).
 */
declare class NotFoundError extends SmolvmError {
    constructor(message: string);
}
/**
 * Resource conflict (HTTP 409).
 */
declare class ConflictError extends SmolvmError {
    constructor(message: string);
}
/**
 * Bad request (HTTP 400).
 */
declare class BadRequestError extends SmolvmError {
    constructor(message: string);
}
/**
 * Request timeout (HTTP 408 or operation timeout).
 */
declare class TimeoutError extends SmolvmError {
    constructor(message: string);
}
/**
 * Internal server error (HTTP 500).
 */
declare class InternalError extends SmolvmError {
    constructor(message: string);
}
/**
 * Network or connection error.
 */
declare class ConnectionError extends SmolvmError {
    constructor(message: string);
}
/**
 * Parse an API error response into the appropriate error class.
 */
declare function parseApiError(statusCode: number, body: ApiErrorResponse): SmolvmError;

/**
 * Parse Server-Sent Events from a readable stream.
 * Yields each data payload as a string.
 */
declare function streamSSE(url: string, signal?: AbortSignal): AsyncIterable<string>;
/**
 * Parse a single SSE event line.
 */
declare function parseSSELine(line: string): {
    event?: string;
    data?: string;
};
/**
 * Combine multiple async iterables into one.
 * Useful for merging log streams from multiple sources.
 */
declare function mergeStreams<T>(...iterables: AsyncIterable<T>[]): AsyncIterable<T>;

export { type ApiErrorResponse, BadRequestError, type CodeOptions, ConflictError, ConnectionError, type CreateMachineRequest, type DeleteResponse, type EnvVar, type ExecOptions, type ExecRequest, type ExecResponse, ExecResult, ExecutionError, type HealthResponse, type ImageInfo, InternalError, type ListImagesResponse, type ListMachinesResponse, type LogsOptions, type LogsQuery, Machine, type MachineConfig, type MachineInfo, type MachineState, type MountInfo, type MountSpec, NodeMachine, NotFoundError, type PortSpec, type PullImageRequest, type PullImageResponse, PythonMachine, type ResourceSpec, type RunRequest, SmolvmClient, SmolvmError, TimeoutError, mergeStreams, parseApiError, parseSSELine, quickExec, quickRun, streamSSE, withMachine };
