/**
 * E2E tests for Sandbox functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve start --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Sandbox, withSandbox, quickExec } from "../sandbox.js";
import { NotFoundError, ConflictError } from "../errors.js";
import {
  requireServer,
  uniqueSandboxName,
  SandboxTracker,
  TEST_SERVER_URL,
  TEST_IMAGE,
  ensureTestImage,
} from "./setup.js";

describe("Sandbox E2E Tests", () => {
  const tracker = new SandboxTracker();

  beforeAll(async () => {
    await requireServer();
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("Sandbox Lifecycle", () => {
    it("should create, start, stop, and delete a sandbox", async () => {
      const name = uniqueSandboxName("lifecycle");
      const sandbox = new Sandbox({ name, serverUrl: TEST_SERVER_URL });

      await sandbox.start();
      expect(sandbox.isStarted).toBe(true);
      expect(sandbox.state).toBe("running");

      const status = await sandbox.status();
      expect(status.name).toBe(name);
      expect(status.state).toBe("running");

      await sandbox.stop();
      expect(sandbox.isStarted).toBe(false);

      await sandbox.delete();
      await expect(sandbox.status()).rejects.toThrow(NotFoundError);
    });

    it("should handle idempotent start and stop", async () => {
      const name = uniqueSandboxName("idempotent");
      const sandbox = new Sandbox({ name, serverUrl: TEST_SERVER_URL });

      await sandbox.start();
      await sandbox.start(); // Second start is no-op
      expect(sandbox.isStarted).toBe(true);

      await sandbox.stop();
      await sandbox.stop(); // Second stop is no-op
      expect(sandbox.isStarted).toBe(false);

      await sandbox.delete();
    });

    it("should reject duplicate sandbox names", async () => {
      const name = uniqueSandboxName("duplicate");
      const sandbox1 = await tracker.create(name);
      expect(sandbox1.isStarted).toBe(true);

      const sandbox2 = new Sandbox({ name, serverUrl: TEST_SERVER_URL });
      await expect(sandbox2.start()).rejects.toThrow(ConflictError);
    });
  });

  describe("Sandbox Execution", () => {
    it("should execute a simple command", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(["echo", "hello world"]);

      expect(result.stdout.trim()).toBe("hello world");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
    });

    it("should capture exit codes", async () => {
      const sandbox = await tracker.create();

      expect((await sandbox.exec(["true"])).exitCode).toBe(0);
      expect((await sandbox.exec(["false"])).exitCode).toBe(1);
      expect((await sandbox.exec(["sh", "-c", "exit 42"])).exitCode).toBe(42);
    });

    it("should capture stderr", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(["sh", "-c", "echo error >&2"]);

      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("error");
    });

    it("should support env vars and workdir", async () => {
      const sandbox = await tracker.create();

      // Env vars
      const envResult = await sandbox.exec(["sh", "-c", "echo $VAR1-$VAR2"], {
        env: { VAR1: "one", VAR2: "two" },
      });
      expect(envResult.stdout.trim()).toBe("one-two");

      // Workdir
      const wdResult = await sandbox.exec(["pwd"], { workdir: "/tmp" });
      expect(wdResult.stdout.trim()).toBe("/tmp");
    });
  });

  describe("Sandbox Run (Container Image)", () => {
    let runSandbox: Sandbox;

    beforeAll(async () => {
      runSandbox = await Sandbox.create({
        name: uniqueSandboxName("run-tests"),
        serverUrl: TEST_SERVER_URL,
      });
      await ensureTestImage(runSandbox);
    });

    afterAll(async () => {
      try {
        await runSandbox.stop();
      } catch {
        // Ignore
      }
      try {
        await runSandbox.delete();
      } catch {
        // Ignore
      }
    });

    it("should run a command in a container image", async () => {
      const result = await runSandbox.run(TEST_IMAGE, [
        "cat",
        "/etc/alpine-release",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+/);
    });

    it("should pass env vars to container run", async () => {
      const result = await runSandbox.run(
        TEST_IMAGE,
        ["sh", "-c", "echo $CONTAINER_VAR"],
        { env: { CONTAINER_VAR: "container-test" } }
      );

      expect(result.stdout.trim()).toBe("container-test");
    });
  });

  describe("Helper Functions", () => {
    it("withSandbox should create, use, and cleanup automatically", async () => {
      const name = uniqueSandboxName("with-sandbox");

      const result = await withSandbox(
        { name, serverUrl: TEST_SERVER_URL },
        async (sandbox) => {
          expect(sandbox.isStarted).toBe(true);
          return sandbox.exec(["echo", "test"]);
        }
      );

      expect(result.stdout.trim()).toBe("test");

      // Verify sandbox was deleted
      const client = new Sandbox({ name, serverUrl: TEST_SERVER_URL }).client;
      await expect(client.getSandbox(name)).rejects.toThrow(NotFoundError);
    });

    it("quickExec should execute and cleanup", async () => {
      const result = await quickExec(["echo", "quick"], {
        serverUrl: TEST_SERVER_URL,
      });

      expect(result.stdout.trim()).toBe("quick");
      expect(result.exitCode).toBe(0);
    });
  });
});
