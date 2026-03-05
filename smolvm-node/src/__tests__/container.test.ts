/**
 * E2E tests for Container functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve start --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Sandbox } from "../sandbox.js";
import { Container } from "../container.js";
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

    sandbox = await Sandbox.create({
      name: uniqueSandboxName("container-suite"),
      serverUrl: TEST_SERVER_URL,
    });

    await ensureTestImage(sandbox);
  });

  afterAll(async () => {
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

  async function safeDelete(container: Container): Promise<void> {
    try {
      await container.stop();
    } catch {
      // Ignore
    }
    try {
      await container.delete(true);
    } catch {
      // Ignore
    }
  }

  describe("Container Lifecycle", () => {
    it("should create a container with correct properties", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      expect(container).toBeInstanceOf(Container);
      expect(container.id).toMatch(/^smolvm-[a-f0-9]+$/);
      expect(container.image).toBe(TEST_IMAGE);
      expect(container.command).toEqual(["sleep", "300"]);
      expect(["created", "running"]).toContain(container.state);
      expect(container.createdAt).toBeGreaterThan(0);

      await safeDelete(container);
    });

    it("should list containers", async () => {
      const container1 = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });
      const container2 = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const containers = await sandbox.listContainers();
      expect(containers.some((c) => c.id === container1.id)).toBe(true);
      expect(containers.some((c) => c.id === container2.id)).toBe(true);

      await safeDelete(container1);
      await safeDelete(container2);
    });

    it("should stop a running container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      await container.stop();
      await container.refresh();
      expect(container.state).toBe("stopped");

      await safeDelete(container);
    });

    it("should delete a stopped container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });
      const containerId = container.id;

      await container.stop();
      await container.delete();

      const containers = await sandbox.listContainers();
      expect(containers.find((c) => c.id === containerId)).toBeUndefined();
    });

    it("should force delete a running container", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });
      const containerId = container.id;

      await container.delete(true);

      const containers = await sandbox.listContainers();
      expect(containers.find((c) => c.id === containerId)).toBeUndefined();
    });
  });

  describe("Container Execution", () => {
    it("should execute a command", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const result = await container.exec(["echo", "hello"]);

      expect(result.stdout.trim()).toBe("hello");
      expect(result.exitCode).toBe(0);

      await safeDelete(container);
    });

    it("should capture exit codes", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      expect((await container.exec(["true"])).exitCode).toBe(0);
      expect((await container.exec(["false"])).exitCode).toBe(1);

      await safeDelete(container);
    });

    it("should capture stderr", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      const result = await container.exec(["sh", "-c", "echo error >&2"]);
      expect(result.stderr.trim()).toBe("error");

      await safeDelete(container);
    });

    it("should support env vars and workdir", async () => {
      const container = await sandbox.createContainer({
        image: TEST_IMAGE,
        command: ["sleep", "300"],
      });

      // Env vars
      const envResult = await container.exec(["sh", "-c", "echo $TEST_VAR"], {
        env: { TEST_VAR: "test-value" },
      });
      expect(envResult.stdout.trim()).toBe("test-value");

      // Workdir
      const wdResult = await container.exec(["pwd"], { workdir: "/tmp" });
      expect(wdResult.stdout.trim()).toBe("/tmp");

      await safeDelete(container);
    });
  });
});
