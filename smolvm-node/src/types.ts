// ============================================================================
// Configuration
// ============================================================================

export interface SandboxConfig {
  name: string;
  serverUrl?: string; // default: "http://127.0.0.1:8080"
  mounts?: MountSpec[];
  ports?: PortSpec[];
  resources?: ResourceSpec;
  restartPolicy?: RestartPolicy; // For persistent VMs (future)
  healthCheck?: HealthCheckConfig; // For health monitoring (future)
}

// ============================================================================
// Restart Policy (for persistent VMs - future feature)
// ============================================================================

export type RestartPolicyType = "always" | "on-failure" | "never";

export interface RestartPolicy {
  policy: RestartPolicyType;
  maxRestarts?: number; // default: 5
  restartDelayMs?: number; // default: 1000
}

// ============================================================================
// Health Check (future feature)
// ============================================================================

export interface HealthCheckConfig {
  command: string[];
  intervalSecs?: number; // default: 30
  timeoutSecs?: number; // default: 5
  retries?: number; // default: 3
}

export type HealthStatus = "healthy" | "unhealthy" | "starting" | "none";

export interface HealthInfo {
  status: HealthStatus;
  lastCheck?: string; // ISO timestamp
}

export interface MountSpec {
  source: string; // Host path
  target: string; // Sandbox path
  readonly?: boolean; // default: false
}

export interface PortSpec {
  host: number;
  guest: number;
}

export interface ResourceSpec {
  cpus?: number; // default: 1
  memoryMb?: number; // default: 256
}

// ============================================================================
// API Request Types
// ============================================================================

export interface CreateSandboxRequest {
  name: string;
  mounts?: MountSpec[];
  ports?: PortSpec[];
  resources?: ResourceSpec;
  restart_policy?: RestartPolicy; // Future
  health_check?: HealthCheckConfig; // Future
}

export interface ExecRequest {
  command: string[];
  env?: EnvVar[];
  workdir?: string;
  timeout_secs?: number;
}

export interface RunRequest {
  image: string;
  command: string[];
  env?: EnvVar[];
  workdir?: string;
  timeout_secs?: number;
}

export interface EnvVar {
  name: string;
  value: string;
}

export interface CreateContainerRequest {
  image: string;
  command?: string[];
  env?: EnvVar[];
  workdir?: string;
  mounts?: ContainerMountSpec[];
}

export interface ContainerMountSpec {
  source: string; // Virtiofs tag (e.g., "smolvm0")
  target: string;
  readonly?: boolean;
}

export interface ContainerExecRequest {
  command: string[];
  env?: EnvVar[];
  workdir?: string;
  timeout_secs?: number;
}

export interface StopContainerRequest {
  timeout_secs?: number;
}

export interface DeleteContainerRequest {
  force?: boolean;
}

export interface PullImageRequest {
  image: string;
  platform?: string;
}

export interface LogsQuery {
  follow?: boolean;
  tail?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface HealthResponse {
  status: string;
  version: string;
}

export interface SandboxInfo {
  name: string;
  state: SandboxState;
  pid?: number;
  mounts: MountInfo[];
  ports: PortSpec[];
  resources: ResourceSpec;
  // Service features (future)
  uptimeSecs?: number;
  restartCount?: number;
  health?: HealthInfo;
  restartPolicy?: RestartPolicy;
}

export type SandboxState = "created" | "running" | "stopped";

export interface MountInfo {
  tag: string; // "smolvm0", "smolvm1", etc.
  source: string;
  target: string;
  readonly: boolean;
}

export interface ListSandboxesResponse {
  sandboxes: SandboxInfo[];
}

export interface ExecResponse {
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface ContainerInfo {
  id: string;
  image: string;
  state: ContainerState;
  created_at: number;
  command: string[];
}

export type ContainerState = "created" | "running" | "stopped";

export interface ListContainersResponse {
  containers: ContainerInfo[];
}

export interface ImageInfo {
  reference: string;
  digest: string;
  size: number;
  architecture: string;
  os: string;
  layer_count: number;
}

export interface ListImagesResponse {
  images: ImageInfo[];
}

export interface PullImageResponse {
  image: ImageInfo;
}

export interface DeleteResponse {
  deleted: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
}

// ============================================================================
// SDK-specific Types
// ============================================================================

export interface ExecOptions {
  env?: Record<string, string>;
  workdir?: string;
  timeout?: number; // seconds
}

export interface LogsOptions {
  follow?: boolean;
  tail?: number;
}

export interface ContainerOptions {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workdir?: string;
  mounts?: Array<{
    tag: string; // "smolvm0", etc.
    target: string;
    readonly?: boolean;
  }>;
}

export interface CodeOptions extends ExecOptions {
  image?: string; // Override default image
}
