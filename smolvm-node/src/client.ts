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
  CreateMachineRequest,
  MachineInfo,
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
  ListMachinesResponse,
  ListContainersResponse,
  ListImagesResponse,
  MachineExecRequest,
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
  // Machines
  // ==========================================================================

  /**
   * Create a new machine.
   */
  async createMachine(req: CreateMachineRequest): Promise<MachineInfo> {
    return this.request<MachineInfo>("POST", "/api/v1/machines", req);
  }

  /**
   * List all machines.
   */
  async listMachines(): Promise<MachineInfo[]> {
    const response = await this.request<ListMachinesResponse>(
      "GET",
      "/api/v1/machines"
    );
    return response.machines;
  }

  /**
   * Get machine by name.
   */
  async getMachine(name: string): Promise<MachineInfo> {
    return this.request<MachineInfo>(
      "GET",
      `/api/v1/machines/${encodeURIComponent(name)}`
    );
  }

  /**
   * Start a machine.
   */
  async startMachine(name: string): Promise<MachineInfo> {
    return this.request<MachineInfo>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(name)}/start`
    );
  }

  /**
   * Stop a machine.
   */
  async stopMachine(name: string): Promise<MachineInfo> {
    return this.request<MachineInfo>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(name)}/stop`
    );
  }

  /**
   * Delete a machine.
   *
   * @param name - Machine name
   * @param force - Force delete even if VM is still running (may orphan the process)
   */
  async deleteMachine(name: string, force?: boolean): Promise<DeleteResponse> {
    const query = force ? "?force=true" : "";
    return this.request<DeleteResponse>(
      "DELETE",
      `/api/v1/machines/${encodeURIComponent(name)}${query}`
    );
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute a command in the machine VM.
   */
  async exec(
    machine: string,
    req: ExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    // Use longer timeout for execution if timeout_secs is specified
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/exec`,
      req,
      requestTimeout
    );
  }

  /**
   * Run a command in a container image within the machine.
   */
  async run(
    machine: string,
    req: RunRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    // Use longer timeout for run if timeout_secs is specified
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/run`,
      req,
      requestTimeout
    );
  }

  /**
   * Stream logs from a machine via SSE.
   */
  async *streamLogs(
    machine: string,
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
    const url = `${this.baseUrl}/api/v1/machines/${encodeURIComponent(machine)}/logs${queryString ? `?${queryString}` : ""}`;

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
   * Create a container in a machine.
   */
  async createContainer(
    machine: string,
    req: CreateContainerRequest
  ): Promise<ContainerInfo> {
    return this.request<ContainerInfo>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers`,
      req
    );
  }

  /**
   * List containers in a machine.
   */
  async listContainers(machine: string): Promise<ContainerInfo[]> {
    const response = await this.request<ListContainersResponse>(
      "GET",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers`
    );
    return response.containers;
  }

  /**
   * Start a container.
   */
  async startContainer(
    machine: string,
    containerId: string
  ): Promise<StartResponse> {
    return this.request<StartResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers/${encodeURIComponent(containerId)}/start`
    );
  }

  /**
   * Stop a container.
   */
  async stopContainer(
    machine: string,
    containerId: string,
    req?: StopContainerRequest
  ): Promise<StopResponse> {
    // API requires a JSON body even if empty
    return this.request<StopResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers/${encodeURIComponent(containerId)}/stop`,
      req ?? {}
    );
  }

  /**
   * Delete a container.
   */
  async deleteContainer(
    machine: string,
    containerId: string,
    req?: DeleteContainerRequest
  ): Promise<DeleteResponse> {
    // API requires force in body, not query params
    return this.request<DeleteResponse>(
      "DELETE",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers/${encodeURIComponent(containerId)}`,
      req ?? {}
    );
  }

  /**
   * Execute a command in a container.
   */
  async execContainer(
    machine: string,
    containerId: string,
    req: ContainerExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/containers/${encodeURIComponent(containerId)}/exec`,
      req,
      requestTimeout
    );
  }

  // ==========================================================================
  // Images
  // ==========================================================================

  /**
   * List images in a machine.
   */
  async listImages(machine: string): Promise<ImageInfo[]> {
    const response = await this.request<ListImagesResponse>(
      "GET",
      `/api/v1/machines/${encodeURIComponent(machine)}/images`
    );
    return response.images;
  }

  /**
   * Pull an image into a machine.
   */
  async pullImage(
    machine: string,
    req: PullImageRequest,
    timeout: number = 300000 // 5 minutes default for image pulls
  ): Promise<ImageInfo> {
    const response = await this.request<PullImageResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(machine)}/images/pull`,
      req,
      timeout
    );
    return response.image;
  }

  /**
   * Execute a command directly in a machine (VM-level, not container).
   */
  async execMachine(
    name: string,
    req: MachineExecRequest,
    timeout?: number
  ): Promise<ExecResponse> {
    const requestTimeout = req.timeoutSecs
      ? (req.timeoutSecs + 10) * 1000
      : timeout;
    return this.request<ExecResponse>(
      "POST",
      `/api/v1/machines/${encodeURIComponent(name)}/exec`,
      req,
      requestTimeout
    );
  }
}
