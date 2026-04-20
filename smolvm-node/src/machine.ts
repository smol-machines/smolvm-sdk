import { SmolvmClient } from "./client.js";
import { Container, type ContainerParent } from "./container.js";
import { ExecResult } from "./execution.js";
import type {
  MachineConfig,
  MachineInfo,
  MachineState,
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
 * High-level machine abstraction for managing microVM machines.
 */
export class Machine implements ContainerParent {
  readonly name: string;
  readonly client: SmolvmClient;

  private config: MachineConfig;
  private _info?: MachineInfo;
  private _started: boolean = false;

  constructor(config: MachineConfig) {
    this.name = config.name;
    this.config = config;
    this.client = new SmolvmClient(config.serverUrl || DEFAULT_SERVER_URL);
  }

  /**
   * Create a new machine and start it.
   */
  static async create(config: MachineConfig): Promise<Machine> {
    const machine = new Machine(config);
    await machine.start();
    return machine;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Create and start the machine.
   * If the machine already exists, it will be started if not already running.
   */
  async start(): Promise<void> {
    if (this._started) {
      return;
    }

    // Create the machine
    this._info = await this.client.createMachine({
      name: this.config.name,
      mounts: this.config.mounts,
      ports: this.config.ports,
      resources: this.config.resources,
    });

    // Start the machine
    this._info = await this.client.startMachine(this.name);
    this._started = true;
  }

  /**
   * Stop the machine.
   */
  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    this._info = await this.client.stopMachine(this.name);
    this._started = false;
  }

  /**
   * Delete the machine.
   */
  async delete(): Promise<void> {
    await this.client.deleteMachine(this.name);
    this._info = undefined;
    this._started = false;
  }

  // =========================================================================
  // Status
  // =========================================================================

  /**
   * Get the current machine status.
   */
  async status(): Promise<MachineInfo> {
    this._info = await this.client.getMachine(this.name);
    return this._info;
  }

  /**
   * Whether the machine has been started.
   */
  get isStarted(): boolean {
    return this._started;
  }

  /**
   * Get the current machine state.
   */
  get state(): MachineState | undefined {
    return this._info?.state as MachineState | undefined;
  }

  /**
   * Get the machine mounts.
   */
  get mounts(): MountInfo[] {
    return this._info?.mounts || [];
  }

  /**
   * Get the raw machine info.
   */
  get info(): MachineInfo | undefined {
    return this._info;
  }

  // =========================================================================
  // Execution
  // =========================================================================

  /**
   * Execute a command directly in the machine VM.
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
   * Run a command in a container image within the machine.
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
   * Stream logs from the machine.
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
   * Create a container in the machine.
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
   * List all containers in the machine.
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
   * List all images in the machine.
   */
  async listImages(): Promise<ImageInfo[]> {
    return this.client.listImages(this.name);
  }

  /**
   * Pull an image into the machine.
   */
  async pullImage(image: string, ociPlatform?: string): Promise<ImageInfo> {
    return this.client.pullImage(this.name, { image, ociPlatform });
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a machine, run a function with it, and clean up afterwards.
 * This is the recommended way to use machines for short-lived tasks.
 */
export async function withMachine<T>(
  config: MachineConfig,
  fn: (machine: Machine) => Promise<T>
): Promise<T> {
  const machine = await Machine.create(config);
  try {
    return await fn(machine);
  } finally {
    try {
      await machine.stop();
    } catch {
      // Ignore stop errors during cleanup
    }
    try {
      await machine.delete();
    } catch {
      // Ignore delete errors during cleanup
    }
  }
}

/**
 * Quick execution helper - creates a temporary machine, runs a command, and cleans up.
 */
export async function quickExec(
  command: string[],
  options?: MachineConfig & ExecOptions
): Promise<ExecResult> {
  const config: MachineConfig = {
    name: options?.name || `quick-exec-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources,
  };

  return withMachine(config, async (machine) => {
    return machine.exec(command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout,
    });
  });
}

/**
 * Quick run helper - creates a temporary machine, runs in an image, and cleans up.
 */
export async function quickRun(
  image: string,
  command: string[],
  options?: MachineConfig & ExecOptions
): Promise<ExecResult> {
  const config: MachineConfig = {
    name: options?.name || `quick-run-${Date.now()}`,
    serverUrl: options?.serverUrl,
    mounts: options?.mounts,
    ports: options?.ports,
    resources: options?.resources,
  };

  return withMachine(config, async (machine) => {
    return machine.run(image, command, {
      env: options?.env,
      workdir: options?.workdir,
      timeout: options?.timeout,
    });
  });
}
