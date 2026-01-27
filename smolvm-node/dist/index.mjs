// src/errors.ts
var SmolvmError = class extends Error {
  code;
  statusCode;
  constructor(message, code, statusCode) {
    super(message);
    this.name = "SmolvmError";
    this.code = code;
    this.statusCode = statusCode;
  }
};
var NotFoundError = class extends SmolvmError {
  constructor(message) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
};
var ConflictError = class extends SmolvmError {
  constructor(message) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
};
var BadRequestError = class extends SmolvmError {
  constructor(message) {
    super(message, "BAD_REQUEST", 400);
    this.name = "BadRequestError";
  }
};
var TimeoutError = class extends SmolvmError {
  constructor(message) {
    super(message, "TIMEOUT", 408);
    this.name = "TimeoutError";
  }
};
var InternalError = class extends SmolvmError {
  constructor(message) {
    super(message, "INTERNAL_ERROR", 500);
    this.name = "InternalError";
  }
};
var ConnectionError = class extends SmolvmError {
  constructor(message) {
    super(message, "CONNECTION_ERROR", 0);
    this.name = "ConnectionError";
  }
};
function parseApiError(statusCode, body) {
  const message = body.error || "Unknown error";
  switch (statusCode) {
    case 400:
      return new BadRequestError(message);
    case 404:
      return new NotFoundError(message);
    case 408:
      return new TimeoutError(message);
    case 409:
      return new ConflictError(message);
    case 500:
    case 502:
    case 503:
      return new InternalError(message);
    default:
      return new SmolvmError(message, body.code || "UNKNOWN", statusCode);
  }
}

// src/client.ts
var DEFAULT_TIMEOUT = 3e4;
var SmolvmClient = class {
  baseUrl;
  constructor(baseUrl = "http://127.0.0.1:8080") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  /**
   * Make an HTTP request to the API.
   */
  async request(method, path, body, timeout = DEFAULT_TIMEOUT) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = {
            error: `HTTP ${response.status}: ${response.statusText}`,
            code: "UNKNOWN"
          };
        }
        throw parseApiError(response.status, errorBody);
      }
      const text = await response.text();
      if (!text) {
        return void 0;
      }
      return JSON.parse(text);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SmolvmError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TimeoutError(`Request timed out after ${timeout}ms`);
        }
        if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("ECONNREFUSED")) {
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
  async health() {
    return this.request("GET", "/health");
  }
  // ==========================================================================
  // Sandboxes
  // ==========================================================================
  /**
   * Create a new sandbox.
   */
  async createSandbox(req) {
    return this.request("POST", "/api/v1/sandboxes", req);
  }
  /**
   * List all sandboxes.
   */
  async listSandboxes() {
    const response = await this.request(
      "GET",
      "/api/v1/sandboxes"
    );
    return response.sandboxes;
  }
  /**
   * Get sandbox by name.
   */
  async getSandbox(name) {
    return this.request(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(name)}`
    );
  }
  /**
   * Start a sandbox.
   */
  async startSandbox(name) {
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(name)}/start`
    );
  }
  /**
   * Stop a sandbox.
   */
  async stopSandbox(name) {
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(name)}/stop`
    );
  }
  /**
   * Delete a sandbox.
   */
  async deleteSandbox(name) {
    await this.request(
      "DELETE",
      `/api/v1/sandboxes/${encodeURIComponent(name)}`
    );
  }
  // ==========================================================================
  // Execution
  // ==========================================================================
  /**
   * Execute a command in the sandbox VM.
   */
  async exec(sandbox, req, timeout) {
    const requestTimeout = req.timeout_secs ? (req.timeout_secs + 10) * 1e3 : timeout;
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/exec`,
      req,
      requestTimeout
    );
  }
  /**
   * Run a command in a container image within the sandbox.
   */
  async run(sandbox, req, timeout) {
    const requestTimeout = req.timeout_secs ? (req.timeout_secs + 10) * 1e3 : timeout;
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/run`,
      req,
      requestTimeout
    );
  }
  /**
   * Stream logs from a sandbox via SSE.
   */
  async *streamLogs(sandbox, query, signal) {
    const params = new URLSearchParams();
    if (query?.follow) {
      params.set("follow", "true");
    }
    if (query?.tail !== void 0) {
      params.set("tail", query.tail.toString());
    }
    const queryString = params.toString();
    const url = `${this.baseUrl}/api/v1/sandboxes/${encodeURIComponent(sandbox)}/logs${queryString ? `?${queryString}` : ""}`;
    const response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal
    });
    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = {
          error: `HTTP ${response.status}: ${response.statusText}`,
          code: "UNKNOWN"
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
  async createContainer(sandbox, req) {
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers`,
      req
    );
  }
  /**
   * List containers in a sandbox.
   */
  async listContainers(sandbox) {
    const response = await this.request(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers`
    );
    return response.containers;
  }
  /**
   * Start a container.
   */
  async startContainer(sandbox, containerId) {
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}/start`
    );
  }
  /**
   * Stop a container.
   */
  async stopContainer(sandbox, containerId, req) {
    return this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}/stop`,
      req
    );
  }
  /**
   * Delete a container.
   */
  async deleteContainer(sandbox, containerId, req) {
    const params = new URLSearchParams();
    if (req?.force) {
      params.set("force", "true");
    }
    const queryString = params.toString();
    await this.request(
      "DELETE",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/containers/${encodeURIComponent(containerId)}${queryString ? `?${queryString}` : ""}`
    );
  }
  /**
   * Execute a command in a container.
   */
  async execContainer(sandbox, containerId, req, timeout) {
    const requestTimeout = req.timeout_secs ? (req.timeout_secs + 10) * 1e3 : timeout;
    return this.request(
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
  async listImages(sandbox) {
    const response = await this.request(
      "GET",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/images`
    );
    return response.images;
  }
  /**
   * Pull an image into a sandbox.
   */
  async pullImage(sandbox, req, timeout = 3e5) {
    const response = await this.request(
      "POST",
      `/api/v1/sandboxes/${encodeURIComponent(sandbox)}/images/pull`,
      req,
      timeout
    );
    return response.image;
  }
};

// src/execution.ts
var ExecutionError = class extends Error {
  exitCode;
  stdout;
  stderr;
  constructor(exitCode, stdout, stderr) {
    super(`Command failed with exit code ${exitCode}`);
    this.name = "ExecutionError";
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
};
var ExecResult = class {
  exitCode;
  stdout;
  stderr;
  constructor(response) {
    this.exitCode = response.exit_code;
    this.stdout = response.stdout;
    this.stderr = response.stderr;
  }
  /**
   * Whether the command exited successfully (exit code 0).
   */
  get success() {
    return this.exitCode === 0;
  }
  /**
   * Combined stdout and stderr output.
   */
  get output() {
    if (this.stdout && this.stderr) {
      return `${this.stdout}
${this.stderr}`;
    }
    return this.stdout || this.stderr;
  }
  /**
   * Assert that the command succeeded (exit code 0).
   * Throws ExecutionError if the command failed.
   * Returns this for method chaining.
   */
  assertSuccess() {
    if (!this.success) {
      throw new ExecutionError(this.exitCode, this.stdout, this.stderr);
    }
    return this;
  }
};

// src/container.ts
var Container = class {
  id;
  parent;
  _info;
  constructor(parent, info) {
    this.id = info.id;
    this.parent = parent;
    this._info = info;
  }
  /**
   * Start the container.
   */
  async start() {
    this._info = await this.parent.client.startContainer(
      this.parent.name,
      this.id
    );
  }
  /**
   * Stop the container.
   * @param timeout - Timeout in seconds to wait for graceful stop
   */
  async stop(timeout) {
    this._info = await this.parent.client.stopContainer(
      this.parent.name,
      this.id,
      timeout !== void 0 ? { timeout_secs: timeout } : void 0
    );
  }
  /**
   * Delete the container.
   * @param force - Force delete even if running
   */
  async delete(force) {
    await this.parent.client.deleteContainer(
      this.parent.name,
      this.id,
      force !== void 0 ? { force } : void 0
    );
  }
  /**
   * Execute a command in the container.
   */
  async exec(command, options) {
    const env = options?.env ? Object.entries(options.env).map(([name, value]) => ({ name, value })) : void 0;
    const response = await this.parent.client.execContainer(
      this.parent.name,
      this.id,
      {
        command,
        env,
        workdir: options?.workdir,
        timeout_secs: options?.timeout
      }
    );
    return new ExecResult(response);
  }
  /**
   * Refresh container info from the server.
   */
  async refresh() {
    const containers = await this.parent.client.listContainers(this.parent.name);
    const container = containers.find((c) => c.id === this.id);
    if (container) {
      this._info = container;
    }
    return this._info;
  }
  /**
   * Get the current container state.
   */
  get state() {
    return this._info.state;
  }
  /**
   * Get the container image.
   */
  get image() {
    return this._info.image;
  }
  /**
   * Get the container command.
   */
  get command() {
    return this._info.command;
  }
  /**
   * Get the container creation timestamp.
   */
  get createdAt() {
    return this._info.created_at;
  }
  /**
   * Get the raw container info.
   */
  get info() {
    return this._info;
  }
};

// src/sandbox.ts
var DEFAULT_SERVER_URL = "http://127.0.0.1:8080";
var Sandbox = class _Sandbox {
  name;
  client;
  config;
  _info;
  _started = false;
  constructor(config) {
    this.name = config.name;
    this.config = config;
    this.client = new SmolvmClient(config.serverUrl || DEFAULT_SERVER_URL);
  }
  /**
   * Create a new sandbox and start it.
   */
  static async create(config) {
    const sandbox = new _Sandbox(config);
    await sandbox.start();
    return sandbox;
  }
  // =========================================================================
  // Lifecycle
  // =========================================================================
  /**
   * Create and start the sandbox.
   * If the sandbox already exists, it will be started if not already running.
   */
  async start() {
    if (this._started) {
      return;
    }
    this._info = await this.client.createSandbox({
      name: this.config.name,
      mounts: this.config.mounts,
      ports: this.config.ports,
      resources: this.config.resources
    });
    this._info = await this.client.startSandbox(this.name);
    this._started = true;
  }
  /**
   * Stop the sandbox.
   */
  async stop() {
    if (!this._started) {
      return;
    }
    this._info = await this.client.stopSandbox(this.name);
    this._started = false;
  }
  /**
   * Delete the sandbox.
   */
  async delete() {
    await this.client.deleteSandbox(this.name);
    this._info = void 0;
    this._started = false;
  }
  // =========================================================================
  // Status
  // =========================================================================
  /**
   * Get the current sandbox status.
   */
  async status() {
    this._info = await this.client.getSandbox(this.name);
    return this._info;
  }
  /**
   * Whether the sandbox has been started.
   */
  get isStarted() {
    return this._started;
  }
  /**
   * Get the current sandbox state.
   */
  get state() {
    return this._info?.state;
  }
  /**
   * Get the sandbox mounts.
   */
  get mounts() {
    return this._info?.mounts || [];
  }
  /**
   * Get the raw sandbox info.
   */
  get info() {
    return this._info;
  }
  // =========================================================================
  // Execution
  // =========================================================================
  /**
   * Execute a command directly in the sandbox VM.
   */
  async exec(command, options) {
    const env = options?.env ? Object.entries(options.env).map(([name, value]) => ({ name, value })) : void 0;
    const response = await this.client.exec(this.name, {
      command,
      env,
      workdir: options?.workdir,
      timeout_secs: options?.timeout
    });
    return new ExecResult(response);
  }
  /**
   * Run a command in a container image within the sandbox.
   */
  async run(image, command, options) {
    const env = options?.env ? Object.entries(options.env).map(([name, value]) => ({ name, value })) : void 0;
    const response = await this.client.run(this.name, {
      image,
      command,
      env,
      workdir: options?.workdir,
      timeout_secs: options?.timeout
    });
    return new ExecResult(response);
  }
  // =========================================================================
  // Logs
  // =========================================================================
  /**
   * Stream logs from the sandbox.
   */
  logs(options) {
    return this.client.streamLogs(this.name, {
      follow: options?.follow,
      tail: options?.tail
    });
  }
  // =========================================================================
  // Containers
  // =========================================================================
  /**
   * Create a container in the sandbox.
   */
  async createContainer(options) {
    const env = options.env ? Object.entries(options.env).map(([name, value]) => ({ name, value })) : void 0;
    const mounts = options.mounts?.map(
      (m) => ({
        source: m.tag,
        target: m.target,
        readonly: m.readonly
      })
    );
    const info = await this.client.createContainer(this.name, {
      image: options.image,
      command: options.command,
      env,
      workdir: options.workdir,
      mounts
    });
    return new Container(this, info);
  }
  /**
   * List all containers in the sandbox.
   */
  async listContainers() {
    const containers = await this.client.listContainers(this.name);
    return containers.map((info) => new Container(this, info));
  }
  /**
   * Get a container by ID.
   */
  async getContainer(id) {
    const containers = await this.client.listContainers(this.name);
    const containerInfo = containers.find((c) => c.id === id);
    if (!containerInfo) {
      throw new Error(`Container not found: ${id}`);
    }
    return new Container(this, containerInfo);
  }
  // =========================================================================
  // Images
  // =========================================================================
  /**
   * List all images in the sandbox.
   */
  async listImages() {
    return this.client.listImages(this.name);
  }
  /**
   * Pull an image into the sandbox.
   */
  async pullImage(image, platform) {
    return this.client.pullImage(this.name, { image, platform });
  }
};
async function withSandbox(config, fn) {
  const sandbox = await Sandbox.create(config);
  try {
    return await fn(sandbox);
  } finally {
    try {
      await sandbox.stop();
    } catch {
    }
    try {
      await sandbox.delete();
    } catch {
    }
  }
}
async function quickExec(command, options) {
  const config = {
    name: options?.name || `quick-exec-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources
  };
  return withSandbox(config, async (sandbox) => {
    return sandbox.exec(command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout
    });
  });
}
async function quickRun(image, command, options) {
  const config = {
    name: options?.name || `quick-run-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources
  };
  return withSandbox(config, async (sandbox) => {
    return sandbox.run(image, command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout
    });
  });
}

// src/presets/python.ts
var PythonSandbox = class _PythonSandbox extends Sandbox {
  static DEFAULT_IMAGE = "python:3.12-alpine";
  /**
   * Create a new Python sandbox and start it.
   */
  static async create(config) {
    const sandbox = new _PythonSandbox(config);
    await sandbox.start();
    return sandbox;
  }
  /**
   * Run Python code directly.
   *
   * @param code - Python code to execute
   * @param options - Execution options
   */
  async runCode(code, options) {
    const image = options?.image || _PythonSandbox.DEFAULT_IMAGE;
    return this.run(image, ["python", "-c", code], options);
  }
  /**
   * Run a Python file.
   *
   * @param path - Path to the Python file (within the sandbox)
   * @param options - Execution options
   */
  async runFile(path, options) {
    const image = options?.image || _PythonSandbox.DEFAULT_IMAGE;
    return this.run(image, ["python", path], options);
  }
  /**
   * Install Python packages using pip.
   *
   * @param packages - Package names to install
   * @param options - Execution options
   */
  async pip(packages, options) {
    return this.run(
      _PythonSandbox.DEFAULT_IMAGE,
      ["pip", "install", ...packages],
      options
    );
  }
  /**
   * Run Python in interactive REPL mode with initial code.
   * Useful for setting up an environment and then running code.
   *
   * @param setupCode - Code to run for setup
   * @param mainCode - Main code to execute
   * @param options - Execution options
   */
  async runWithSetup(setupCode, mainCode, options) {
    const fullCode = `${setupCode}
${mainCode}`;
    return this.runCode(fullCode, options);
  }
  /**
   * Check Python version.
   */
  async version(options) {
    const result = await this.runCode(
      "import sys; print(sys.version)",
      options
    );
    return result.stdout.trim();
  }
  /**
   * List installed packages.
   */
  async listPackages(options) {
    const result = await this.run(
      _PythonSandbox.DEFAULT_IMAGE,
      ["pip", "list", "--format=freeze"],
      options
    );
    return result.stdout.trim().split("\n").filter((line) => line.length > 0);
  }
};

// src/presets/node.ts
var NodeSandbox = class _NodeSandbox extends Sandbox {
  static DEFAULT_IMAGE = "node:22-alpine";
  /**
   * Create a new Node sandbox and start it.
   */
  static async create(config) {
    const sandbox = new _NodeSandbox(config);
    await sandbox.start();
    return sandbox;
  }
  /**
   * Run JavaScript code directly.
   *
   * @param code - JavaScript code to execute
   * @param options - Execution options
   */
  async runCode(code, options) {
    const image = options?.image || _NodeSandbox.DEFAULT_IMAGE;
    return this.run(image, ["node", "-e", code], options);
  }
  /**
   * Run a JavaScript file.
   *
   * @param path - Path to the JavaScript file (within the sandbox)
   * @param options - Execution options
   */
  async runFile(path, options) {
    const image = options?.image || _NodeSandbox.DEFAULT_IMAGE;
    return this.run(image, ["node", path], options);
  }
  /**
   * Run npm commands.
   *
   * @param args - Arguments to pass to npm
   * @param options - Execution options
   */
  async npm(args, options) {
    return this.run(_NodeSandbox.DEFAULT_IMAGE, ["npm", ...args], options);
  }
  /**
   * Install npm packages.
   *
   * @param packages - Package names to install
   * @param options - Execution options
   */
  async npmInstall(packages, options) {
    return this.npm(["install", ...packages], options);
  }
  /**
   * Run npx commands.
   *
   * @param args - Arguments to pass to npx
   * @param options - Execution options
   */
  async npx(args, options) {
    return this.run(_NodeSandbox.DEFAULT_IMAGE, ["npx", ...args], options);
  }
  /**
   * Check Node.js version.
   */
  async version(options) {
    const result = await this.runCode("console.log(process.version)", options);
    return result.stdout.trim();
  }
  /**
   * Run code with ES modules support.
   *
   * @param code - ES module code to execute
   * @param options - Execution options
   */
  async runESM(code, options) {
    const image = options?.image || _NodeSandbox.DEFAULT_IMAGE;
    return this.run(
      image,
      ["node", "--input-type=module", "-e", code],
      options
    );
  }
  /**
   * Evaluate a JavaScript expression and return the result.
   *
   * @param expression - JavaScript expression to evaluate
   * @param options - Execution options
   */
  async evaluate(expression, options) {
    return this.runCode(`console.log(JSON.stringify(${expression}))`, options);
  }
};

// src/logs.ts
async function* streamSSE(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal
  });
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = {
        error: `HTTP ${response.status}: ${response.statusText}`,
        code: "UNKNOWN"
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
    if (buffer.startsWith("data: ")) {
      yield buffer.slice(6);
    }
  } finally {
    reader.releaseLock();
  }
}
function parseSSELine(line) {
  if (line.startsWith("event: ")) {
    return { event: line.slice(7) };
  }
  if (line.startsWith("data: ")) {
    return { data: line.slice(6) };
  }
  return {};
}
async function* mergeStreams(...iterables) {
  if (iterables.length === 0) return;
  if (iterables.length === 1) {
    yield* iterables[0];
    return;
  }
  const queue = [];
  let resolveWaiting = null;
  let activeCount = iterables.length;
  let error = null;
  const consumers = iterables.map(async (iterable) => {
    try {
      for await (const value of iterable) {
        queue.push(value);
        if (resolveWaiting) {
          const resolve = resolveWaiting;
          resolveWaiting = null;
          resolve();
        }
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    } finally {
      activeCount--;
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }
  });
  while (activeCount > 0 || queue.length > 0) {
    if (error) throw error;
    if (queue.length > 0) {
      yield queue.shift();
    } else if (activeCount > 0) {
      await new Promise((resolve) => {
        resolveWaiting = resolve;
      });
    }
  }
  await Promise.all(consumers);
  if (error) throw error;
}
export {
  BadRequestError,
  ConflictError,
  ConnectionError,
  Container,
  ExecResult,
  ExecutionError,
  InternalError,
  NodeSandbox,
  NotFoundError,
  PythonSandbox,
  Sandbox,
  SmolvmClient,
  SmolvmError,
  TimeoutError,
  mergeStreams,
  parseApiError,
  parseSSELine,
  quickExec,
  quickRun,
  streamSSE,
  withSandbox
};
