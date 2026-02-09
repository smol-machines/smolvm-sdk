/**
 * SmolvmClient - HTTP client for the smolvm API.
 *
 * This client uses types generated from the OpenAPI spec for type safety.
 */

import {
  SmolvmError,
  ConnectionError,
  TimeoutError,
  parseApiError,
} from "./errors.js";

// Import types from generated OpenAPI models
import type {
  HealthResponse,
  CreateSandboxRequest,
  SandboxInfo,
  ExecRequest,
  ExecResponse,
  RunRequest,
  CreateContainerRequest,
  ContainerInfo,
  ContainerExecRequest,
  StopContainerRequest,
  DeleteContainerRequest,
  DeleteResponse,
  ImageInfo,
  PullImageRequest,
  PullImageResponse,
  ApiErrorResponse,
  ListSandboxesResponse,
  ListContainersResponse,
  ListImagesResponse,
  CreateMicrovmRequest,
  MicrovmInfo,
  MicrovmExecRequest,
  ListMicrovmsResponse,
  LogsQuery,
} from "./generated/models/index.js";

/** Response from starting a container. */
interface StartResponse {
  started: string;
}

/** Response from stopping a container. */
interface StopResponse {
  stopped: string;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Low-level HTTP client for the smolvm API.
 *
 * Types are generated from the OpenAPI specification for guaranteed compatibility.
 */
export class SmolvmClient {
  readonly baseUrl: string;

  constructor(baseUrl: string = "http://127.0.0.1:8080") {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Make an HTTP request to the API.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody: ApiErrorResponse;
        try {
          errorBody = (await response.json()) as ApiErrorResponse;
        } catch {
          errorBody = {
            error: `HTTP ${response.status}: ${response.statusText}`,
            code: "UNKNOWN",
          };
        }
        throw parseApiError(response.status, errorBody);
      }

      // Handle empty responses (e.g., DELETE)
      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof SmolvmError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TimeoutError(`Request timed out after ${timeout}ms`);
        }
        if (
          error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("ECONNREFUSED")
        ) {
          throw new ConnectionError(
            `Failed to connect to ${this.baseUrl}: ${error.message}`
          );
        }
      }

      throw new ConnectionError(`Request failed: ${error}`);
    }
  }

  // ==========================================================================
  // Health
  // ==========================================================================

  /**
   * Check server health.
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/health");
  }

  // ==========================================================================
  // Sandboxes
  // ==========================================================================

  /**
   * Create a new sandbox.
   */
  async createSandbox(req: CreateSandboxRequest): Promise<SandboxInfo> {
    return this.request<SandboxInfo>("POST", "/api/v1/sandboxes", req);
  }

  /**
   * List all sandboxes.
   */
  async listSandboxes(): Promise<SandboxInfo[]> {
    const response = await this.request<ListSandboxesResponse>(
      "GET",
      "/api/v1/sandboxes"
    );
    return response.sandboxes;
  }

  /**
   * Get sandbox by name.
   */
  async getSandbox(name: string): Promise<SandboxInfo> {
    return this.request<SandboxInfo>(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(name)}`
    );
  }

  /**
   * Start a sandbox.
   */
  async startSandbox(name: string): Promise<SandboxInfo> {
    return this.request<SandboxInfo>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(name)}/start`
    );
  }

  /**
   * Stop a sandbox.
   */
  async stopSandbox(name: string): Promise<SandboxInfo> {
    return this.request<SandboxInfo>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(name)}/stop`
    );
  }

  /**
   * Delete a sandbox.
   *
   * @param name - Sandbox name
   * @param force - Force delete even if VM is still running (may orphan the process)
   */
  async deleteSandbox(name: string, force?: boolean): Promise<DeleteResponse> {
    const query = force ? "?force=true" : "";
    return this.request<DeleteResponse>(
      "DELETE",
      `/api/v1/sandboxes/${encodeURIComponent(name)}${query}`
    );
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute a command in the sandbox VM.
   */
  async exec(
    sandbox: string,
    req: ExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    // Use longer timeout for execution if timeout_secs is specified
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/exec`,
      req,
      requestTimeout
    );
  }

  /**
   * Run a command in a container image within the sandbox.
   */
  async run(
    sandbox: string,
    req: RunRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    // Use longer timeout for run if timeout_secs is specified
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/run`,
      req,
      requestTimeout
    );
  }

  /**
   * Stream logs from a sandbox via SSE.
   */
  async *streamLogs(
    sandbox: string,
    query?: LogsQuery,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const params = new URLSearchParams();
    if (query?.follow) {
      params.set("follow", "true");
    }
    if (query?.tail != null) {
      params.set("tail", query.tail.toString());
    }

    const queryString = params.toString();
    const url = `${this.baseUrl}/api/v1/sandboxes/${encodeURIComponent(sandbox)}/logs${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal,
    });

    if (!response.ok) {
      let errorBody: ApiErrorResponse;
      try {
        errorBody = (await response.json()) as ApiErrorResponse;
      } catch {
        errorBody = {
          error: `HTTP ${response.status}: ${response.statusText}`,
          code: "UNKNOWN",
        };
      }
      throw parseApiError(response.status, errorBody);
    }

    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            yield line.slice(6);
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.startsWith("data: ")) {
        yield buffer.slice(6);
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ==========================================================================
  // Containers
  // ==========================================================================

  /**
   * Create a container in a sandbox.
   */
  async createContainer(
    sandbox: string,
    req: CreateContainerRequest
  ): Promise<ContainerInfo> {
    return this.request<ContainerInfo>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers`,
      req
    );
  }

  /**
   * List containers in a sandbox.
   */
  async listContainers(sandbox: string): Promise<ContainerInfo[]> {
    const response = await this.request<ListContainersResponse>(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers`
    );
    return response.containers;
  }

  /**
   * Start a container.
   */
  async startContainer(
    sandbox: string,
    containerId: string
  ): Promise<StartResponse> {
    return this.request<StartResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}/start`
    );
  }

  /**
   * Stop a container.
   */
  async stopContainer(
    sandbox: string,
    containerId: string,
    req?: StopContainerRequest
  ): Promise<StopResponse> {
    // API requires a JSON body even if empty
    return this.request<StopResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}/stop`,
      req ?? {}
    );
  }

  /**
   * Delete a container.
   */
  async deleteContainer(
    sandbox: string,
    containerId: string,
    req?: DeleteContainerRequest
  ): Promise<DeleteResponse> {
    // API requires force in body, not query params
    return this.request<DeleteResponse>(
      "DELETE",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}`,
      req ?? {}
    );
  }

  /**
   * Execute a command in a container.
   */
  async execContainer(
    sandbox: string,
    containerId: string,
    req: ContainerExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}/exec`,
      req,
      requestTimeout
    );
  }

  // ==========================================================================
  // Images
  // ==========================================================================

  /**
   * List images in a sandbox.
   */
  async listImages(sandbox: string): Promise<ImageInfo[]> {
    const response = await this.request<ListImagesResponse>(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/images`
    );
    return response.images;
  }

  /**
   * Pull an image into a sandbox.
   */
  async pullImage(
    sandbox: string,
    req: PullImageRequest,
    timeout: number = 300000 // 5 minutes default for image pulls
  ): Promise<ImageInfo> {
    const response = await this.request<PullImageResponse>(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/images/pull`,
      req,
      timeout
    );
    return response.image;
  }

  // ==========================================================================
  // MicroVMs
  // ==========================================================================

  /**
   * Create a new microvm.
   */
  async createMicrovm(req: CreateMicrovmRequest): Promise<MicrovmInfo> {
    return this.request<MicrovmInfo>("POST", "/api/v1/microvms", req);
  }

  /**
   * List all microvms.
   */
  async listMicrovms(): Promise<MicrovmInfo[]> {
    const response = await this.request<ListMicrovmsResponse>(
      "GET",
      "/api/v1/microvms"
    );
    return response.microvms;
  }

  /**
   * Get microvm by name.
   */
  async getMicrovm(name: string): Promise<MicrovmInfo> {
    return this.request<MicrovmInfo>(
      "GET",
      `/api/v1/microvms/${encodeURIComponent(name)}`
    );
  }

  /**
   * Start a microvm.
   */
  async startMicrovm(name: string): Promise<MicrovmInfo> {
    return this.request<MicrovmInfo>(
      "POST",
      `/api/v1/microvms/${encodeURIComponent(name)}/start`
    );
  }

  /**
   * Stop a microvm.
   */
  async stopMicrovm(name: string): Promise<MicrovmInfo> {
    return this.request<MicrovmInfo>(
      "POST",
      `/api/v1/microvms/${encodeURIComponent(name)}/stop`
    );
  }

  /**
   * Delete a microvm.
   */
  async deleteMicrovm(name: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `/api/v1/microvms/${encodeURIComponent(name)}`
    );
  }

  /**
   * Execute a command in a microvm.
   */
  async execMicrovm(
    name: string,
    req: MicrovmExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/microvms/${encodeURIComponent(name)}/exec`,
      req,
      requestTimeout
    );
  }
}
