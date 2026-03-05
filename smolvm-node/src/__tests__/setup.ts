/**
 * Test setup utilities for smolvm SDK e2e tests.
 */

import { SmolvmClient } from "../client.js";
import { Sandbox } from "../sandbox.js";
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
 * Ensure the test image is pulled in the given sandbox.
 * Images are per-sandbox, so we need to check and pull for each sandbox.
 */
export async function ensureTestImage(sandbox: Sandbox): Promise<void> {
  // Check if image already exists in this sandbox
  try {
    const images = await sandbox.listImages();
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
    await sandbox.pullImage(TEST_IMAGE);
  } catch (error) {
    // Image might already exist, which is fine
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists")) {
      throw error;
    }
  }
}

/**
 * Generate a unique sandbox name for testing.
 */
export function uniqueSandboxName(prefix: string = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper to create a sandbox and ensure cleanup.
 * Returns the sandbox and a cleanup function.
 */
export async function createTestSandbox(
  name?: string
): Promise<{ sandbox: Sandbox; cleanup: () => Promise<void> }> {
  const sandboxName = name || uniqueSandboxName();
  const sandbox = await Sandbox.create({
    name: sandboxName,
    serverUrl: TEST_SERVER_URL,
  });

  const cleanup = async () => {
    try {
      await sandbox.stop();
    } catch {
      // Ignore stop errors
    }
    try {
      await sandbox.delete();
    } catch {
      // Ignore delete errors
    }
  };

  return { sandbox, cleanup };
}

/**
 * Track sandboxes created during a test for cleanup.
 */
export class SandboxTracker {
  private sandboxes: Sandbox[] = [];

  /**
   * Create and track a sandbox.
   */
  async create(name?: string): Promise<Sandbox> {
    const sandboxName = name || uniqueSandboxName();
    const sandbox = await Sandbox.create({
      name: sandboxName,
      serverUrl: TEST_SERVER_URL,
    });
    this.sandboxes.push(sandbox);
    return sandbox;
  }

  /**
   * Clean up all tracked sandboxes.
   */
  async cleanup(): Promise<void> {
    for (const sandbox of this.sandboxes) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore
      }
      try {
        await sandbox.delete();
      } catch {
        // Ignore
      }
    }
    this.sandboxes = [];
  }
}
