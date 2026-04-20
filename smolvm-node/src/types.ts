/**
 * Type definitions for smolvm SDK.
 *
 * API types are re-exported from the generated OpenAPI models.
 * SDK-specific types are defined here for ergonomic wrappers.
 */

// Re-export all generated types from OpenAPI
export type {
  // Request types
  CreateMachineRequest,
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
  MachineExecRequest,
  RestartSpec,
  MountSpec,
  PortSpec,
  ResourceSpec,
  DeleteQuery,
  ResizeMachineRequest,
  // Response types
  HealthResponse,
  MachineInfo,
  MountInfo,
  ListMachinesResponse,
  ExecResponse,
  ContainerInfo,
  ListContainersResponse,
  ImageInfo,
  ListImagesResponse,
  PullImageResponse,
  DeleteResponse,
  StartResponse,
  StopResponse,
  ApiErrorResponse,
} from "./generated/models/index.js";

// ============================================================================
// SDK-specific Configuration Types
// ============================================================================

import type { MountSpec, PortSpec, ResourceSpec } from "./generated/models/index.js";

/**
 * Configuration for creating a machine via the high-level SDK.
 */
export interface MachineConfig {
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
export type MachineState = "created" | "running" | "stopped";

/**
 * Container state.
 */
export type ContainerState = "created" | "running" | "stopped";

/**
 * Options for command execution.
 */
export interface ExecOptions {
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
export interface LogsOptions {
  /** Only return logs after this timestamp */
  since?: string;
  /** Follow log output */
  follow?: boolean;
}

/**
 * Container creation options.
 */
export interface ContainerOptions {
  /** Working directory inside the container */
  workdir?: string;
  /** Container volume mounts (using virtiofs tags from machine mounts) */
  mounts?: Array<{ source: string; target: string; readOnly?: boolean }>;
}

/**
 * Options for code execution (extends ExecOptions).
 */
export interface CodeOptions extends ExecOptions {
  /** Override default image */
  image?: string;
}

/**
 * Restart policy configuration.
 */
export type RestartPolicy = {
  policy: "always" | "on-failure" | "never";
  maxRetries?: number;
};

/**
 * Health check configuration.
 */
export interface HealthCheckConfig {
  /** Command to run for health check */
  command: string[];
  /** Interval between checks in seconds */
  interval?: number;
  /** Timeout for each check in seconds */
  timeout?: number;
  /** Number of retries before marking unhealthy */
  retries?: number;
  /** Grace period after start before checking */
  startPeriod?: number;
}

/**
 * Health check status.
 */
export type HealthStatus = "healthy" | "unhealthy" | "starting" | "none";

/**
 * Health check info returned by the API.
 */
export interface HealthInfo {
  status: HealthStatus;
  failingStreak: number;
  lastOutput?: string;
}

export type RestartPolicyType = "always" | "on-failure" | "never";
