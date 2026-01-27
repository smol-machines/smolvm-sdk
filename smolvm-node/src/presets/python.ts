import { Sandbox } from "../sandbox.js";
import { ExecResult } from "../execution.js";
import type { SandboxConfig, CodeOptions, ExecOptions } from "../types.js";

/**
 * Python-specific sandbox with convenience methods for running Python code.
 */
export class PythonSandbox extends Sandbox {
  static readonly DEFAULT_IMAGE = "python:3.12-alpine";

  /**
   * Create a new Python sandbox and start it.
   */
  static async create(config: SandboxConfig): Promise<PythonSandbox> {
    const sandbox = new PythonSandbox(config);
    await sandbox.start();
    return sandbox;
  }

  /**
   * Run Python code directly.
   *
   * @param code - Python code to execute
   * @param options - Execution options
   */
  async runCode(code: string, options?: CodeOptions): Promise<ExecResult> {
    const image = options?.image || PythonSandbox.DEFAULT_IMAGE;
    return this.run(image, ["python", "-c", code], options);
  }

  /**
   * Run a Python file.
   *
   * @param path - Path to the Python file (within the sandbox)
   * @param options - Execution options
   */
  async runFile(path: string, options?: CodeOptions): Promise<ExecResult> {
    const image = options?.image || PythonSandbox.DEFAULT_IMAGE;
    return this.run(image, ["python", path], options);
  }

  /**
   * Install Python packages using pip.
   *
   * @param packages - Package names to install
   * @param options - Execution options
   */
  async pip(packages: string[], options?: ExecOptions): Promise<ExecResult> {
    return this.run(
      PythonSandbox.DEFAULT_IMAGE,
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
  async runWithSetup(
    setupCode: string,
    mainCode: string,
    options?: CodeOptions
  ): Promise<ExecResult> {
    const fullCode = `${setupCode}\n${mainCode}`;
    return this.runCode(fullCode, options);
  }

  /**
   * Check Python version.
   */
  async version(options?: CodeOptions): Promise<string> {
    const result = await this.runCode(
      "import sys; print(sys.version)",
      options
    );
    return result.stdout.trim();
  }

  /**
   * List installed packages.
   */
  async listPackages(options?: ExecOptions): Promise<string[]> {
    const result = await this.run(
      PythonSandbox.DEFAULT_IMAGE,
      ["pip", "list", "--format=freeze"],
      options
    );
    return result.stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  }
}
