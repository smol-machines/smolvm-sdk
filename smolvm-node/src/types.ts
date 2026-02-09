/**
 * Type definitions for smolvm SDK.
 *
 * API types are re-exported from the generated OpenAPI models.
 * SDK-specific types are defined here for ergonomic wrappers.
 */

// Re-export all generated types from OpenAPI
export type {
  // Request types
  CreateSandboxRequest,
  ExecRequest,
  RunRequest,
  EnvVar,
  CreateContainerRequest,
  ContainerMountSpec,
  ContainerExecRequest,
  StopContainerRequest,
  DeleteContainerRequest,
  PullImageRequest,
  LogsQuery,
  CreateMicrovmRequest,
  MicrovmExecRequest,
  RestartSpec,
  MountSpec,
  PortSpec,
  ResourceSpec,
  DeleteQuery,
  // Response types
  HealthResponse,
  SandboxInfo,
  MountInfo,
  ListSandboxesResponse,
  ExecResponse,
  ContainerInfo,
  ListContainersResponse,
  ImageInfo,
  ListImagesResponse,
  PullImageResponse,
  DeleteResponse,
  ApiErrorResponse,
  MicrovmInfo,
  ListMicrovmsResponse,
} from "./generated/models/index.js";

// ============================================================================
// SDK-specific Configuration Types
// ============================================================================

import type { MountSpec, PortSpec, ResourceSpec } from "./generated/models/index.js";

/**
 * Configuration for creating a sandbox via the high-level SDK.
 */
export interface SandboxConfig {
  /** Unique name for the sandbox */
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
 * Sandbox state.
 */
export type SandboxState = "created" | "running" | "stopped";

/**
 * Container state.
 */
export type ContainerState = "created" | "running" | "stopped";

// ============================================================================
// SDK Execution Options
// ============================================================================

/**
 * Options for command execution.
 */
export interface ExecOptions {
  /** Environment variables as key-value pairs */
  env?: Record<string, string>;
  /** Working directory for the command */
  workdir?: string;
  /** Timeout in seconds */
  timeout?: number;
}

/**
 * Options for log streaming.
 */
export interface LogsOptions {
  /** Follow the logs (like tail -f) */
  follow?: boolean;
  /** Number of lines to show from the end */
  tail?: number;
}

/**
 * Options for creating a container.
 */
export interface ContainerOptions {
  /** OCI image to use */
  image: string;
  /** Command and arguments */
  command?: string[];
  /** Environment variables as key-value pairs */
  env?: Record<string, string>;
  /** Working directory */
  workdir?: string;
  /** Volume mounts using virtiofs tags */
  mounts?: Array<{
    /** Virtiofs tag (e.g., "smolvm0") */
    tag: string;
    /** Target path in container */
    target: string;
    /** Read-only mount */
    readonly?: boolean;
  }>;
}

/**
 * Options for code execution (extends ExecOptions).
 */
export interface CodeOptions extends ExecOptions {
  /** Override default image */
  image?: string;
}

// ============================================================================
// Legacy Type Aliases (for backwards compatibility)
// ============================================================================

// These type aliases exist for backwards compatibility with code that uses
// the old snake_case naming convention for SDK-specific types.

/** @deprecated Use RestartSpec from generated types */
export type RestartPolicy = {
  policy: "always" | "on-failure" | "never" | "unless-stopped";
  max_retries?: number;
};

/** @deprecated Use HealthResponse from generated types */
export interface HealthCheckConfig {
  command: string[];
  intervalSecs?: number;
  timeoutSecs?: number;
  retries?: number;
}

/** @deprecated */
export type HealthStatus = "healthy" | "unhealthy" | "starting" | "none";

/** @deprecated */
export interface HealthInfo {
  status: HealthStatus;
  lastCheck?: string;
}

/** @deprecated Use RestartPolicyType instead */
export type RestartPolicyType = "always" | "on-failure" | "never";
