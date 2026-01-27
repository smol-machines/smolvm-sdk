interface SandboxConfig {
    name: string;
    serverUrl?: string;
    mounts?: MountSpec[];
    ports?: PortSpec[];
    resources?: ResourceSpec;
}
interface MountSpec {
    source: string;
    target: string;
    readonly?: boolean;
}
interface PortSpec {
    host: number;
    guest: number;
}
interface ResourceSpec {
    cpus?: number;
    memoryMb?: number;
}
interface CreateSandboxRequest {
    name: string;
    mounts?: MountSpec[];
    ports?: PortSpec[];
    resources?: ResourceSpec;
}
interface ExecRequest {
    command: string[];
    env?: EnvVar[];
    workdir?: string;
    timeout_secs?: number;
}
interface RunRequest {
    image: string;
    command: string[];
    env?: EnvVar[];
    workdir?: string;
    timeout_secs?: number;
}
interface EnvVar {
    name: string;
    value: string;
}
interface CreateContainerRequest {
    image: string;
    command?: string[];
    env?: EnvVar[];
    workdir?: string;
    mounts?: ContainerMountSpec[];
}
interface ContainerMountSpec {
    source: string;
    target: string;
    readonly?: boolean;
}
interface ContainerExecRequest {
    command: string[];
    env?: EnvVar[];
    workdir?: string;
    timeout_secs?: number;
}
interface StopContainerRequest {
    timeout_secs?: number;
}
interface DeleteContainerRequest {
    force?: boolean;
}
interface PullImageRequest {
    image: string;
    platform?: string;
}
interface LogsQuery {
    follow?: boolean;
    tail?: number;
}
interface HealthResponse {
    status: string;
    version: string;
}
interface SandboxInfo {
    name: string;
    state: SandboxState;
    pid?: number;
    mounts: MountInfo[];
    ports: PortSpec[];
    resources: ResourceSpec;
}
type SandboxState = "created" | "running" | "stopped";
interface MountInfo {
    tag: string;
    source: string;
    target: string;
    readonly: boolean;
}
interface ListSandboxesResponse {
    sandboxes: SandboxInfo[];
}
interface ExecResponse {
    exit_code: number;
    stdout: string;
    stderr: string;
}
interface ContainerInfo {
    id: string;
    image: string;
    state: ContainerState;
    created_at: number;
    command: string[];
}
type ContainerState = "created" | "running" | "stopped";
interface ListContainersResponse {
    containers: ContainerInfo[];
}
interface ImageInfo {
    reference: string;
    digest: string;
    size: number;
    architecture: string;
    os: string;
    layer_count: number;
}
interface ListImagesResponse {
    images: ImageInfo[];
}
interface PullImageResponse {
    image: ImageInfo;
}
interface DeleteResponse {
    deleted: string;
}
interface ApiErrorResponse {
    error: string;
    code: string;
}
interface ExecOptions {
    env?: Record<string, string>;
    workdir?: string;
    timeout?: number;
}
interface LogsOptions {
    follow?: boolean;
    tail?: number;
}
interface ContainerOptions {
    image: string;
    command?: string[];
    env?: Record<string, string>;
    workdir?: string;
    mounts?: Array<{
        tag: string;
        target: string;
        readonly?: boolean;
    }>;
}
interface CodeOptions extends ExecOptions {
    image?: string;
}

/**
 * Low-level HTTP client for the smolvm API.
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
     * Create a new sandbox.
     */
    createSandbox(req: CreateSandboxRequest): Promise<SandboxInfo>;
    /**
     * List all sandboxes.
     */
    listSandboxes(): Promise<SandboxInfo[]>;
    /**
     * Get sandbox by name.
     */
    getSandbox(name: string): Promise<SandboxInfo>;
    /**
     * Start a sandbox.
     */
    startSandbox(name: string): Promise<SandboxInfo>;
    /**
     * Stop a sandbox.
     */
    stopSandbox(name: string): Promise<SandboxInfo>;
    /**
     * Delete a sandbox.
     */
    deleteSandbox(name: string): Promise<void>;
    /**
     * Execute a command in the sandbox VM.
     */
    exec(sandbox: string, req: ExecRequest, timeout?: number): Promise<ExecResponse>;
    /**
     * Run a command in a container image within the sandbox.
     */
    run(sandbox: string, req: RunRequest, timeout?: number): Promise<ExecResponse>;
    /**
     * Stream logs from a sandbox via SSE.
     */
    streamLogs(sandbox: string, query?: LogsQuery, signal?: AbortSignal): AsyncIterable<string>;
    /**
     * Create a container in a sandbox.
     */
    createContainer(sandbox: string, req: CreateContainerRequest): Promise<ContainerInfo>;
    /**
     * List containers in a sandbox.
     */
    listContainers(sandbox: string): Promise<ContainerInfo[]>;
    /**
     * Start a container.
     */
    startContainer(sandbox: string, containerId: string): Promise<ContainerInfo>;
    /**
     * Stop a container.
     */
    stopContainer(sandbox: string, containerId: string, req?: StopContainerRequest): Promise<ContainerInfo>;
    /**
     * Delete a container.
     */
    deleteContainer(sandbox: string, containerId: string, req?: DeleteContainerRequest): Promise<void>;
    /**
     * Execute a command in a container.
     */
    execContainer(sandbox: string, containerId: string, req: ContainerExecRequest, timeout?: number): Promise<ExecResponse>;
    /**
     * List images in a sandbox.
     */
    listImages(sandbox: string): Promise<ImageInfo[]>;
    /**
     * Pull an image into a sandbox.
     */
    pullImage(sandbox: string, req: PullImageRequest, timeout?: number): Promise<ImageInfo>;
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
 * Minimal interface for what Container needs from its parent.
 * This avoids circular dependency issues with Sandbox.
 */
interface ContainerParent {
    readonly name: string;
    readonly client: SmolvmClient;
}
/**
 * Container abstraction for managing containers within a sandbox.
 */
declare class Container {
    readonly id: string;
    readonly parent: ContainerParent;
    private _info;
    constructor(parent: ContainerParent, info: ContainerInfo);
    /**
     * Start the container.
     */
    start(): Promise<void>;
    /**
     * Stop the container.
     * @param timeout - Timeout in seconds to wait for graceful stop
     */
    stop(timeout?: number): Promise<void>;
    /**
     * Delete the container.
     * @param force - Force delete even if running
     */
    delete(force?: boolean): Promise<void>;
    /**
     * Execute a command in the container.
     */
    exec(command: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Refresh container info from the server.
     */
    refresh(): Promise<ContainerInfo>;
    /**
     * Get the current container state.
     */
    get state(): ContainerState;
    /**
     * Get the container image.
     */
    get image(): string;
    /**
     * Get the container command.
     */
    get command(): string[];
    /**
     * Get the container creation timestamp.
     */
    get createdAt(): number;
    /**
     * Get the raw container info.
     */
    get info(): ContainerInfo;
}

/**
 * High-level sandbox abstraction for managing microVM sandboxes.
 */
declare class Sandbox implements ContainerParent {
    readonly name: string;
    readonly client: SmolvmClient;
    private config;
    private _info?;
    private _started;
    constructor(config: SandboxConfig);
    /**
     * Create a new sandbox and start it.
     */
    static create(config: SandboxConfig): Promise<Sandbox>;
    /**
     * Create and start the sandbox.
     * If the sandbox already exists, it will be started if not already running.
     */
    start(): Promise<void>;
    /**
     * Stop the sandbox.
     */
    stop(): Promise<void>;
    /**
     * Delete the sandbox.
     */
    delete(): Promise<void>;
    /**
     * Get the current sandbox status.
     */
    status(): Promise<SandboxInfo>;
    /**
     * Whether the sandbox has been started.
     */
    get isStarted(): boolean;
    /**
     * Get the current sandbox state.
     */
    get state(): SandboxState | undefined;
    /**
     * Get the sandbox mounts.
     */
    get mounts(): MountInfo[];
    /**
     * Get the raw sandbox info.
     */
    get info(): SandboxInfo | undefined;
    /**
     * Execute a command directly in the sandbox VM.
     */
    exec(command: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Run a command in a container image within the sandbox.
     */
    run(image: string, command: string[], options?: ExecOptions): Promise<ExecResult>;
    /**
     * Stream logs from the sandbox.
     */
    logs(options?: LogsOptions): AsyncIterable<string>;
    /**
     * Create a container in the sandbox.
     */
    createContainer(options: ContainerOptions): Promise<Container>;
    /**
     * List all containers in the sandbox.
     */
    listContainers(): Promise<Container[]>;
    /**
     * Get a container by ID.
     */
    getContainer(id: string): Promise<Container>;
    /**
     * List all images in the sandbox.
     */
    listImages(): Promise<ImageInfo[]>;
    /**
     * Pull an image into the sandbox.
     */
    pullImage(image: string, platform?: string): Promise<ImageInfo>;
}
/**
 * Create a sandbox, run a function with it, and clean up afterwards.
 * This is the recommended way to use sandboxes for short-lived tasks.
 */
declare function withSandbox<T>(config: SandboxConfig, fn: (sandbox: Sandbox) => Promise<T>): Promise<T>;
/**
 * Quick execution helper - creates a temporary sandbox, runs a command, and cleans up.
 */
declare function quickExec(command: string[], options?: SandboxConfig & ExecOptions): Promise<ExecResult>;
/**
 * Quick run helper - creates a temporary sandbox, runs in an image, and cleans up.
 */
declare function quickRun(image: string, command: string[], options?: SandboxConfig & ExecOptions): Promise<ExecResult>;

/**
 * Python-specific sandbox with convenience methods for running Python code.
 */
declare class PythonSandbox extends Sandbox {
    static readonly DEFAULT_IMAGE = "python:3.12-alpine";
    /**
     * Create a new Python sandbox and start it.
     */
    static create(config: SandboxConfig): Promise<PythonSandbox>;
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
     * @param path - Path to the Python file (within the sandbox)
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
 * Node.js-specific sandbox with convenience methods for running JavaScript/TypeScript.
 */
declare class NodeSandbox extends Sandbox {
    static readonly DEFAULT_IMAGE = "node:22-alpine";
    /**
     * Create a new Node sandbox and start it.
     */
    static create(config: SandboxConfig): Promise<NodeSandbox>;
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
     * @param path - Path to the JavaScript file (within the sandbox)
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

export { type ApiErrorResponse, BadRequestError, type CodeOptions, ConflictError, ConnectionError, Container, type ContainerExecRequest, type ContainerInfo, type ContainerMountSpec, type ContainerOptions, type ContainerParent, type ContainerState, type CreateContainerRequest, type CreateSandboxRequest, type DeleteContainerRequest, type DeleteResponse, type EnvVar, type ExecOptions, type ExecRequest, type ExecResponse, ExecResult, ExecutionError, type HealthResponse, type ImageInfo, InternalError, type ListContainersResponse, type ListImagesResponse, type ListSandboxesResponse, type LogsOptions, type LogsQuery, type MountInfo, type MountSpec, NodeSandbox, NotFoundError, type PortSpec, type PullImageRequest, type PullImageResponse, PythonSandbox, type ResourceSpec, type RunRequest, Sandbox, type SandboxConfig, type SandboxInfo, type SandboxState, SmolvmClient, SmolvmError, type StopContainerRequest, TimeoutError, mergeStreams, parseApiError, parseSSELine, quickExec, quickRun, streamSSE, withSandbox };
