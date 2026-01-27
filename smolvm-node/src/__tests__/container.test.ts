/**
 * E2E tests for Container functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Sandbox } from "../sandbox.js";
import { Container } from "../container.js";
import { ExecResult } from "../execution.js";
import {
  requireServer,
  uniqueSandboxName,
  TEST_SERVER_URL,
  TEST_IMAGE,
  ensureTestImage,
} from "./setup.js";

describe("Container E2E Tests", () => {
  let sandbox: Sandbox;

  beforeAll(async () => {
    await requireServer();

    // Create a single sandbox for all container tests
    sandbox = await Sandbox.create({
      name: uniqueSandboxName("container-suite"),
      serverUrl: TEST_SERVER_URL,
    });

    // Pull the test image once for the entire test suite
    await ensureTestImage(sandbox);
  });

  afterAll(async () => {
    // Cleanup sandbox at the end of all tests
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
  });

  // Helper to safely cleanup a container
  async function safeDelete(container: Container): Promise<void> {
    try {
      await container.stop();
    } catch {
      // Ignore stop errors
    }
    try {
      await container.delete(true);
    } catch {
      // Ignore delete errors - container might already be gone
    }
  }

  describe("Container Lifecycle", () => {
    it("should create a container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      expect(container).toBeInstanceOf(Container);
      expect(container.id).toBeDefined();
      expect(container.id).toMatch(/^smolvm-[a-f0-9]+$/);
      expect(container.image).toBe(TEST_IMAGE);
      expect(container.command).toEqual(["sleep", "300"]);
      // Note: smolvm auto-starts containers after creation
      expect(["created", "running"]).toContain(container.state);

      // Cleanup
      await safeDelete(container);
    });

    it("should have a running container after creation", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // smolvm auto-starts containers
      await container.refresh();
      expect(container.state).toBe("running");

      // Cleanup
      await safeDelete(container);
    });

    it("should stop a running container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      await container.refresh();
      expect(container.state).toBe("running");

      await container.stop();
      await container.refresh();
      expect(container.state).toBe("stopped");

      // Cleanup
      await safeDelete(container);
    });

    it("should delete a stopped container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const containerId = container.id;

      // Stop first
      await container.stop();

      // Delete (no force needed for stopped container)
      await container.delete();

      // Verify deleted
      const containers = await sandbox.listContainers();
      const found = containers.find((c) => c.id === containerId);
      expect(found).toBeUndefined();
    });

    it("should force delete a running container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      await container.refresh();
      expect(container.state).toBe("running");

      // Force delete while running
      await container.delete(true);

      // Verify deleted
      const containers = await sandbox.listContainers();
      const found = containers.find((c) => c.id === container.id);
      expect(found).toBeUndefined();
    });
  });

  describe("Container Execution", () => {
    it("should execute a command in a running container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // Container auto-starts, no need to call start()
      const result = await container.exec(["echo", "hello from container"]);

      expect(result).toBeInstanceOf(ExecResult);
      expect(result.stdout.trim()).toBe("hello from container");
      expect(result.exitCode).toBe(0);

      // Cleanup
      await safeDelete(container);
    });

    it("should capture exit codes from container exec", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const success = await container.exec(["true"]);
      expect(success.exitCode).toBe(0);
      expect(success.success).toBe(true);

      const fail = await container.exec(["false"]);
      expect(fail.exitCode).toBe(1);
      expect(fail.success).toBe(false);

      // Cleanup
      await safeDelete(container);
    });

    it("should capture stderr from container exec", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const result = await container.exec(["sh", "-c", "echo error >&2"]);

      expect(result.stderr.trim()).toBe("error");

      // Cleanup
      await safeDelete(container);
    });

    it("should pass environment variables to container exec", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const result = await container.exec(["sh", "-c", "echo $TEST_VAR"], {
        env: { TEST_VAR: "exec-env-value" },
      });

      expect(result.stdout.trim()).toBe("exec-env-value");

      // Cleanup
      await safeDelete(container);
    });

    it("should set working directory in container exec", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const result = await container.exec(["pwd"], {
        workdir: "/tmp",
      });

      expect(result.stdout.trim()).toBe("/tmp");

      // Cleanup
      await safeDelete(container);
    });
  });

  describe("Container Listing", () => {
    it("should list containers in a sandbox", async () => {
      // Create multiple containers
      const container1 = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const container2 = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const containers = await sandbox.listContainers();

      expect(containers.length).toBeGreaterThanOrEqual(2);
      expect(containers.some((c) => c.id === container1.id)).toBe(true);
      expect(containers.some((c) => c.id === container2.id)).toBe(true);

      // Cleanup
      await safeDelete(container1);
      await safeDelete(container2);
    });

    it("should get a container by ID", async () => {
      const created = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const fetched = await sandbox.getContainer(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.image).toBe(created.image);

      // Cleanup
      await safeDelete(created);
    });

    it("should throw when getting non-existent container", async () => {
      await expect(
        sandbox.getContainer("smolvm-nonexistent1234")
      ).rejects.toThrow("Container not found");
    });
  });

  describe("Container Properties", () => {
    it("should have correct properties after creation", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      expect(container.id).toBeDefined();
      expect(container.image).toBe(TEST_IMAGE);
      expect(container.command).toEqual(["sleep", "300"]);
      // smolvm auto-starts containers
      expect(["created", "running"]).toContain(container.state);
      expect(container.createdAt).toBeDefined();
      expect(container.createdAt).toBeGreaterThan(0);
      expect(container.info).toBeDefined();

      // Cleanup
      await safeDelete(container);
    });

    it("should update state after refresh", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // After refresh, container should be running (smolvm auto-starts)
      const info = await container.refresh();
      expect(info.state).toBe("running");
      expect(container.state).toBe("running");

      // Cleanup
      await safeDelete(container);
    });
  });

  describe("Container with Environment Variables", () => {
    it("should pass env vars at exec time", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // Env vars passed at exec time should be available
      const result = await container.exec(["sh", "-c", "echo $EXEC_VAR"], {
        env: { EXEC_VAR: "exec-time-value" },
      });
      expect(result.stdout.trim()).toBe("exec-time-value");

      // Cleanup
      await safeDelete(container);
    });
  });

  describe("Container Workdir", () => {
    it("should respect workdir at exec time", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // Workdir passed at exec time should be used
      const result = await container.exec(["pwd"], {
        workdir: "/tmp",
      });
      expect(result.stdout.trim()).toBe("/tmp");

      // Cleanup
      await safeDelete(container);
    });
  });
});
