import { SmolvmClient } from "./client.js";
import { Container, type ContainerParent } from "./container.js";
import { ExecResult } from "./execution.js";
import type {
  SandboxConfig,
  SandboxInfo,
  SandboxState,
  MountInfo,
  ExecOptions,
  LogsOptions,
  ContainerOptions,
  ImageInfo,
  EnvVar,
  ContainerMountSpec,
} from "./types.js";

const DEFAULT_SERVER_URL = "http://127.0.0.1:8080";

/**
 * High-level sandbox abstraction for managing microVM sandboxes.
 */
export class Sandbox implements ContainerParent {
  readonly name: string;
  readonly client: SmolvmClient;

  private config: SandboxConfig;
  private _info?: SandboxInfo;
  private _started: boolean = false;

  constructor(config: SandboxConfig) {
    this.name = config.name;
    this.config = config;
    this.client = new SmolvmClient(config.serverUrl || DEFAULT_SERVER_URL);
  }

  /**
   * Create a new sandbox and start it.
   */
  static async create(config: SandboxConfig): Promise<Sandbox> {
    const sandbox = new Sandbox(config);
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
  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    // Create the sandbox
    this._info = await this.client.createSandbox({
      name: this.config.name,
      mounts: this.config.mounts,
      ports: this.config.ports,
      resources: this.config.resources,
    });

    // Start the sandbox
    this._info = await this.client.startSandbox(this.name);
    this._started = true;
  }

  /**
   * Stop the sandbox.
   */
  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    this._info = await this.client.stopSandbox(this.name);
    this._started = false;
  }

  /**
   * Delete the sandbox.
   */
  async delete(): Promise<void> {
    await this.client.deleteSandbox(this.name);
    this._info = undefined;
    this._started = false;
  }

  // =========================================================================
  // Status
  // =========================================================================

  /**
   * Get the current sandbox status.
   */
  async status(): Promise<SandboxInfo> {
    this._info = await this.client.getSandbox(this.name);
    return this._info;
  }

  /**
   * Whether the sandbox has been started.
   */
  get isStarted(): boolean {
    return this._started;
  }

  /**
   * Get the current sandbox state.
   */
  get state(): SandboxState | undefined {
    return this._info?.state as SandboxState | undefined;
  }

  /**
   * Get the sandbox mounts.
   */
  get mounts(): MountInfo[] {
    return this._info?.mounts || [];
  }

  /**
   * Get the raw sandbox info.
   */
  get info(): SandboxInfo | undefined {
    return this._info;
  }

  // =========================================================================
  // Execution
  // =========================================================================

  /**
   * Execute a command directly in the sandbox VM.
   */
  async exec(command: string[], options?: ExecOptions): Promise<ExecResult> {
    const env: EnvVar[] | undefined = options?.env
      ? Object.entries(options.env).map(([name, value]) => ({ name, value }))
      : undefined;

    const response = await this.client.exec(this.name, {
      command,
      env,
      workdir: options?.workdir,
      timeoutSecs: options?.timeout,
    });

    return new ExecResult(response);
  }

  /**
   * Run a command in a container image within the sandbox.
   */
  async run(
    image: string,
    command: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    const env: EnvVar[] | undefined = options?.env
      ? Object.entries(options.env).map(([name, value]) => ({ name, value }))
      : undefined;

    const response = await this.client.run(this.name, {
      image,
      command,
      env,
      workdir: options?.workdir,
      timeoutSecs: options?.timeout,
    });

    return new ExecResult(response);
  }

  // =========================================================================
  // Logs
  // =========================================================================

  /**
   * Stream logs from the sandbox.
   */
  logs(options?: LogsOptions): AsyncIterable<string> {
    return this.client.streamLogs(this.name, {
      follow: options?.follow,
      tail: options?.tail,
    });
  }

  // =========================================================================
  // Containers
  // =========================================================================

  /**
   * Create a container in the sandbox.
   */
  async createContainer(options: ContainerOptions): Promise<Container> {
    const env: EnvVar[] | undefined = options.env
      ? Object.entries(options.env).map(([name, value]) => ({ name, value }))
      : undefined;

    const mounts: ContainerMountSpec[] | undefined = options.mounts?.map(
      (m) => ({
        source: m.tag,
        target: m.target,
        readonly: m.readonly,
      })
    );

    const info = await this.client.createContainer(this.name, {
      image: options.image,
      command: options.command,
      env,
      workdir: options.workdir,
      mounts,
    });

    return new Container(this, info);
  }

  /**
   * List all containers in the sandbox.
   */
  async listContainers(): Promise<Container[]> {
    const containers = await this.client.listContainers(this.name);
    return containers.map((info) => new Container(this, info));
  }

  /**
   * Get a container by ID.
   */
  async getContainer(id: string): Promise<Container> {
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
  async listImages(): Promise<ImageInfo[]> {
    return this.client.listImages(this.name);
  }

  /**
   * Pull an image into the sandbox.
   */
  async pullImage(image: string, platform?: string): Promise<ImageInfo> {
    return this.client.pullImage(this.name, { image, platform });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a sandbox, run a function with it, and clean up afterwards.
 * This is the recommended way to use sandboxes for short-lived tasks.
 */
export async function withSandbox<T>(
  config: SandboxConfig,
  fn: (sandbox: Sandbox) => Promise<T>
): Promise<T> {
  const sandbox = await Sandbox.create(config);
  try {
    return await fn(sandbox);
  } finally {
    try {
      await sandbox.stop();
    } catch {
      // Ignore stop errors during cleanup
    }
    try {
      await sandbox.delete();
    } catch {
      // Ignore delete errors during cleanup
    }
  }
}

/**
 * Quick execution helper - creates a temporary sandbox, runs a command, and cleans up.
 */
export async function quickExec(
  command: string[],
  options?: SandboxConfig & ExecOptions
): Promise<ExecResult> {
  const config: SandboxConfig = {
    name: options?.name || `quick-exec-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources,
  };

  return withSandbox(config, async (sandbox) => {
    return sandbox.exec(command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout,
    });
  });
}

/**
 * Quick run helper - creates a temporary sandbox, runs in an image, and cleans up.
 */
export async function quickRun(
  image: string,
  command: string[],
  options?: SandboxConfig & ExecOptions
): Promise<ExecResult> {
  const config: SandboxConfig = {
    name: options?.name || `quick-run-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources,
  };

  return withSandbox(config, async (sandbox) => {
    return sandbox.run(image, command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout,
    });
  });
}
