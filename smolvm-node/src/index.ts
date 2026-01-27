// Core classes
export { SmolvmClient } from "./client.js";
export { Sandbox, withSandbox, quickExec, quickRun } from "./sandbox.js";
export { Container } from "./container.js";
export { ExecResult, ExecutionError } from "./execution.js";

// Presets
export { PythonSandbox, NodeSandbox } from "./presets/index.js";

// Errors
export {
  SmolvmError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  TimeoutError,
  InternalError,
  ConnectionError,
  parseApiError,
} from "./errors.js";

// Utilities
export { streamSSE, parseSSELine, mergeStreams } from "./logs.js";

// Types
export type {
  // Configuration
  SandboxConfig,
  MountSpec,
  PortSpec,
  ResourceSpec,

  // API Request Types
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

  // API Response Types
  HealthResponse,
  SandboxInfo,
  SandboxState,
  MountInfo,
  ListSandboxesResponse,
  ExecResponse,
  ContainerInfo,
  ContainerState,
  ListContainersResponse,
  ImageInfo,
  ListImagesResponse,
  PullImageResponse,
  DeleteResponse,
  ApiErrorResponse,

  // SDK-specific Types
  ExecOptions,
  LogsOptions,
  ContainerOptions,
  CodeOptions,
} from "./types.js";

// Re-export ContainerParent interface for advanced use cases
export type { ContainerParent } from "./container.js";
