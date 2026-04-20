/**
 * Test setup utilities for smolvm SDK e2e tests.
 */

import { SmolvmClient } from "../client.js";
import { Machine } from "../machine.js";
import { ConnectionError } from "../errors.js";

// Default test server URL
export const TEST_SERVER_URL =
  process.env.SMOLVM_TEST_SERVER || "http://127.0.0.1:8080";

// Test image that's small and commonly available
export const TEST_IMAGE = "alpine:latest";

// Shared client for health checks
const testClient = new SmolvmClient(TEST_SERVER_URL);

/**
 * Check if the smolvm server is running.
 */
export async function isServerRunning(): Promise<boolean> {
  try {
    await testClient.health();
    return true;
  } catch (error) {
    if (error instanceof ConnectionError) {
      return false;
    }
    throw error;
  }
}

/**
 * Skip test if server is not running.
 * Call this at the start of test suites that require the server.
 */
export async function requireServer(): Promise<void> {
  const running = await isServerRunning();
  if (!running) {
    throw new Error(
      `smolvm server not running at ${TEST_SERVER_URL}. ` +
        `Start it with: smolvm serve start --listen 127.0.0.1:8080`
    );
  }
}

/**
 * Ensure the test image is pulled in the given machine.
 * Images are per-machine, so we need to check and pull for each machine.
 */
export async function ensureTestImage(machine: Machine): Promise<void> {
  // Check if image already exists in this machine
  try {
    const images = await machine.listImages();
    const hasImage = images.some(
      (img) => img.reference === TEST_IMAGE || img.reference.startsWith("alpine:")
    );
    if (hasImage) {
      return;
    }
  } catch {
    // If we can't list images, try to pull anyway
  }

  // Pull the image
  try {
    await machine.pullImage(TEST_IMAGE);
  } catch (error) {
    // Image might already exist, which is fine
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists")) {
      throw error;
    }
  }
}

/**
 * Generate a unique machine name for testing.
 */
export function uniqueMachineName(prefix: string = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper to create a machine and ensure cleanup.
 * Returns the machine and a cleanup function.
 */
export async function createTestMachine(
  name?: string
): Promise<{ machine: Machine; cleanup: () => Promise<void> }> {
  const machineName = name || uniqueMachineName();
  const machine = await Machine.create({
    name: machineName,
    serverUrl: TEST_SERVER_URL,
  });

  const cleanup = async () => {
    try {
      await machine.stop();
    } catch {
      // Ignore stop errors
    }
    try {
      await machine.delete();
    } catch {
      // Ignore delete errors
    }
  };

  return { machine, cleanup };
}

/**
 * Track machines created during a test for cleanup.
 */
export class MachineTracker {
  private machines: Machine[] = [];

  /**
   * Create and track a machine.
   */
  async create(name?: string): Promise<Machine> {
    const machineName = name || uniqueMachineName();
    const machine = await Machine.create({
      name: machineName,
      serverUrl: TEST_SERVER_URL,
    });
    this.machines.push(machine);
    return machine;
  }

  /**
   * Clean up all tracked machines.
   */
  async cleanup(): Promise<void> {
    for (const machine of this.machines) {
      try {
        await machine.stop();
      } catch {
        // Ignore
      }
      try {
        await machine.delete();
      } catch {
        // Ignore
      }
    }
    this.machines = [];
  }
}
