import { Sandbox } from "../sandbox.js";
import { ExecResult } from "../execution.js";
import type { SandboxConfig, CodeOptions, ExecOptions } from "../types.js";

/**
 * Node.js-specific sandbox with convenience methods for running JavaScript/TypeScript.
 */
export class NodeSandbox extends Sandbox {
  static readonly DEFAULT_IMAGE = "node:22-alpine";

  /**
   * Create a new Node sandbox and start it.
   */
  static async create(config: SandboxConfig): Promise<NodeSandbox> {
    const sandbox = new NodeSandbox(config);
    await sandbox.start();
    return sandbox;
  }

  /**
   * Run JavaScript code directly.
   *
   * @param code - JavaScript code to execute
   * @param options - Execution options
   */
  async runCode(code: string, options?: CodeOptions): Promise<ExecResult> {
    const image = options?.image || NodeSandbox.DEFAULT_IMAGE;
    return this.run(image, ["node", "-e", code], options);
  }

  /**
   * Run a JavaScript file.
   *
   * @param path - Path to the JavaScript file (within the sandbox)
   * @param options - Execution options
   */
  async runFile(path: string, options?: CodeOptions): Promise<ExecResult> {
    const image = options?.image || NodeSandbox.DEFAULT_IMAGE;
    return this.run(image, ["node", path], options);
  }

  /**
   * Run npm commands.
   *
   * @param args - Arguments to pass to npm
   * @param options - Execution options
   */
  async npm(args: string[], options?: ExecOptions): Promise<ExecResult> {
    return this.run(NodeSandbox.DEFAULT_IMAGE, ["npm", ...args], options);
  }

  /**
   * Install npm packages.
   *
   * @param packages - Package names to install
   * @param options - Execution options
   */
  async npmInstall(
    packages: string[],
    options?: ExecOptions
  ): Promise<ExecResult> {
    return this.npm(["install", ...packages], options);
  }

  /**
   * Run npx commands.
   *
   * @param args - Arguments to pass to npx
   * @param options - Execution options
   */
  async npx(args: string[], options?: ExecOptions): Promise<ExecResult> {
    return this.run(NodeSandbox.DEFAULT_IMAGE, ["npx", ...args], options);
  }

  /**
   * Check Node.js version.
   */
  async version(options?: CodeOptions): Promise<string> {
    const result = await this.runCode("console.log(process.version)", options);
    return result.stdout.trim();
  }

  /**
   * Run code with ES modules support.
   *
   * @param code - ES module code to execute
   * @param options - Execution options
   */
  async runESM(code: string, options?: CodeOptions): Promise<ExecResult> {
    const image = options?.image || NodeSandbox.DEFAULT_IMAGE;
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
  async evaluate(
    expression: string,
    options?: CodeOptions
  ): Promise<ExecResult> {
    return this.runCode(`console.log(JSON.stringify(${expression}))`, options);
  }
}
