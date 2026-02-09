import { SmolvmClient } from "./client.js";
import { ExecResult } from "./execution.js";
import type {
  ContainerInfo,
  ContainerState,
  ExecOptions,
  EnvVar,
} from "./types.js";

/**
 * Minimal interface for what Container needs from its parent.
 * This avoids circular dependency issues with Sandbox.
 */
export interface ContainerParent {
  readonly name: string;
  readonly client: SmolvmClient;
}

/**
 * Container abstraction for managing containers within a sandbox.
 */
export class Container {
  readonly id: string;
  readonly parent: ContainerParent;

  private _info: ContainerInfo;

  constructor(parent: ContainerParent, info: ContainerInfo) {
    this.id = info.id;
    this.parent = parent;
    this._info = info;
  }

  /**
   * Start the container.
   */
  async start(): Promise<void> {
    await this.parent.client.startContainer(this.parent.name, this.id);
  }

  /**
   * Stop the container.
   * @param timeout - Timeout in seconds to wait for graceful stop
   */
  async stop(timeout?: number): Promise<void> {
    await this.parent.client.stopContainer(
      this.parent.name,
      this.id,
      timeout !== undefined ? { timeoutSecs: timeout } : undefined
    );
  }

  /**
   * Delete the container.
   * @param force - Force delete even if running
   */
  async delete(force?: boolean): Promise<void> {
    await this.parent.client.deleteContainer(
      this.parent.name,
      this.id,
      force !== undefined ? { force } : undefined
    );
  }

  /**
   * Execute a command in the container.
   */
  async exec(command: string[], options?: ExecOptions): Promise<ExecResult> {
    const env: EnvVar[] | undefined = options?.env
      ? Object.entries(options.env).map(([name, value]) => ({ name, value }))
      : undefined;

    const response = await this.parent.client.execContainer(
      this.parent.name,
      this.id,
      {
        command,
        env,
        workdir: options?.workdir,
        timeoutSecs: options?.timeout,
      }
    );

    return new ExecResult(response);
  }

  /**
   * Refresh container info from the server.
   */
  async refresh(): Promise<ContainerInfo> {
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
  get state(): ContainerState {
    return this._info.state as ContainerState;
  }

  /**
   * Get the container image.
   */
  get image(): string {
    return this._info.image;
  }

  /**
   * Get the container command.
   */
  get command(): string[] {
    return this._info.command;
  }

  /**
   * Get the container creation timestamp.
   */
  get createdAt(): number {
    // Note: API returns snake_case but generated types use camelCase
    // We access the raw response with snake_case since client doesn't transform
    return (this._info as any).created_at ?? this._info.createdAt;
  }

  /**
   * Get the raw container info.
   */
  get info(): ContainerInfo {
    return this._info;
  }
}
