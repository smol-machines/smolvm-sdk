// Core classes
export { SmolvmClient } from "./client.js";
export { Machine, withMachine, quickExec, quickRun } from "./machine.js";
export { ExecResult, ExecutionError } from "./execution.js";

// Presets
export { PythonMachine, NodeMachine } from "./presets/index.js";

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
  MachineConfig,
  MountSpec,
  PortSpec,
  ResourceSpec,

  // API Request Types
  CreateMachineRequest,
  ExecRequest,
  RunRequest,
  EnvVar,
  PullImageRequest,
  LogsQuery,

  // API Response Types
  HealthResponse,
  MachineInfo,
  MachineState,
  MountInfo,
  ListMachinesResponse,
  ExecResponse,
  ImageInfo,
  ListImagesResponse,
  PullImageResponse,
  DeleteResponse,
  ApiErrorResponse,

  // SDK-specific Types
  ExecOptions,
  LogsOptions,
  CodeOptions,
} from "./types.js";
