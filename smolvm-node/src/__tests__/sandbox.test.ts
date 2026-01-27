/**
 * E2E tests for Sandbox functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Sandbox, withSandbox, quickExec } from "../sandbox.js";
import { ExecResult } from "../execution.js";
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

      // Start creates and starts the sandbox
      await sandbox.start();
      expect(sandbox.isStarted).toBe(true);

      // Check status
      const status = await sandbox.status();
      expect(status.name).toBe(name);
      expect(status.state).toBe("running");

      // Stop the sandbox
      await sandbox.stop();
      expect(sandbox.isStarted).toBe(false);

      // Delete the sandbox
      await sandbox.delete();

      // Verify deleted - should throw NotFoundError
      await expect(sandbox.status()).rejects.toThrow(NotFoundError);
    });

    it("should create a sandbox using static create method", async () => {
      const sandbox = await tracker.create();
      expect(sandbox.isStarted).toBe(true);

      const status = await sandbox.status();
      expect(status.state).toBe("running");
    });

    it("should handle starting an already started sandbox", async () => {
      const sandbox = await tracker.create();
      expect(sandbox.isStarted).toBe(true);

      // Second start should be a no-op (returns early)
      await sandbox.start();
      expect(sandbox.isStarted).toBe(true);
    });

    it("should handle stopping an already stopped sandbox", async () => {
      const name = uniqueSandboxName("double-stop");
      const sandbox = new Sandbox({ name, serverUrl: TEST_SERVER_URL });

      await sandbox.start();
      await sandbox.stop();
      expect(sandbox.isStarted).toBe(false);

      // Second stop should be a no-op (returns early)
      await sandbox.stop();
      expect(sandbox.isStarted).toBe(false);

      await sandbox.delete();
    });

    it("should reject duplicate sandbox names", async () => {
      const name = uniqueSandboxName("duplicate");
      const sandbox1 = await tracker.create(name);
      expect(sandbox1.isStarted).toBe(true);

      // Try to create another with the same name
      const sandbox2 = new Sandbox({ name, serverUrl: TEST_SERVER_URL });
      await expect(sandbox2.start()).rejects.toThrow(ConflictError);
    });
  });

  describe("Sandbox Execution", () => {
    it("should execute a simple command", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(["echo", "hello world"]);

      expect(result).toBeInstanceOf(ExecResult);
      expect(result.stdout.trim()).toBe("hello world");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
    });

    it("should capture exit codes", async () => {
      const sandbox = await tracker.create();

      // Exit code 0
      const success = await sandbox.exec(["true"]);
      expect(success.exitCode).toBe(0);
      expect(success.success).toBe(true);

      // Exit code 1
      const fail = await sandbox.exec(["false"]);
      expect(fail.exitCode).toBe(1);
      expect(fail.success).toBe(false);

      // Custom exit code
      const custom = await sandbox.exec(["sh", "-c", "exit 42"]);
      expect(custom.exitCode).toBe(42);
      expect(custom.success).toBe(false);
    });

    it("should capture stderr", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec([
        "sh",
        "-c",
        "echo error message >&2",
      ]);

      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("error message");
      expect(result.exitCode).toBe(0);
    });

    it("should pass environment variables", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(["sh", "-c", "echo $MY_VAR"], {
        env: { MY_VAR: "test-value-123" },
      });

      expect(result.stdout.trim()).toBe("test-value-123");
    });

    it("should pass multiple environment variables", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(
        ["sh", "-c", "echo $VAR1-$VAR2-$VAR3"],
        {
          env: {
            VAR1: "one",
            VAR2: "two",
            VAR3: "three",
          },
        }
      );

      expect(result.stdout.trim()).toBe("one-two-three");
    });

    it("should set working directory", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec(["pwd"], {
        workdir: "/tmp",
      });

      expect(result.stdout.trim()).toBe("/tmp");
    });

    it("should execute complex commands with pipes via sh", async () => {
      const sandbox = await tracker.create();

      const result = await sandbox.exec([
        "sh",
        "-c",
        "echo 'line1\nline2\nline3' | wc -l",
      ]);

      expect(result.stdout.trim()).toBe("3");
    });

    it("should use assertSuccess for error handling", async () => {
      const sandbox = await tracker.create();

      // Success case - assertSuccess returns the result
      const success = await sandbox.exec(["true"]);
      const returned = success.assertSuccess();
      expect(returned).toBe(success);

      // Failure case - assertSuccess throws
      const fail = await sandbox.exec(["false"]);
      expect(() => fail.assertSuccess()).toThrow();
    });
  });

  describe("Sandbox Run (Container Image)", () => {
    // Use a persistent sandbox for all run tests to avoid re-pulling images
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
      const result = await runSandbox.run(TEST_IMAGE, ["echo", "from alpine"]);

      expect(result.stdout.trim()).toBe("from alpine");
      expect(result.exitCode).toBe(0);
    });

    it("should access Alpine-specific commands", async () => {
      const result = await runSandbox.run(TEST_IMAGE, [
        "cat",
        "/etc/alpine-release",
      ]);

      expect(result.exitCode).toBe(0);
      // Alpine release version should be present
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+/);
    });

    it("should pass environment variables to container run", async () => {
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
          return sandbox.exec(["echo", "via withSandbox"]);
        }
      );

      expect(result.stdout.trim()).toBe("via withSandbox");

      // Verify sandbox was deleted
      const client = new Sandbox({ name, serverUrl: TEST_SERVER_URL }).client;
      await expect(client.getSandbox(name)).rejects.toThrow(NotFoundError);
    });

    it("withSandbox should cleanup even on error", async () => {
      const name = uniqueSandboxName("with-sandbox-error");

      await expect(
        withSandbox({ name, serverUrl: TEST_SERVER_URL }, async () => {
          throw new Error("intentional test error");
        })
      ).rejects.toThrow("intentional test error");

      // Verify sandbox was still deleted
      const client = new Sandbox({ name, serverUrl: TEST_SERVER_URL }).client;
      await expect(client.getSandbox(name)).rejects.toThrow(NotFoundError);
    });

    it("quickExec should execute and cleanup", async () => {
      const result = await quickExec(["echo", "quick test"], {
        serverUrl: TEST_SERVER_URL,
      });

      expect(result.stdout.trim()).toBe("quick test");
      expect(result.exitCode).toBe(0);
    });

    it("quickExec with environment variables", async () => {
      const result = await quickExec(["sh", "-c", "echo $QUICK_VAR"], {
        serverUrl: TEST_SERVER_URL,
        env: { QUICK_VAR: "quick-value" },
      });

      expect(result.stdout.trim()).toBe("quick-value");
    });
  });

  describe("Sandbox Status and Properties", () => {
    it("should return correct state after operations", async () => {
      const name = uniqueSandboxName("state");
      const sandbox = new Sandbox({ name, serverUrl: TEST_SERVER_URL });

      // Initially not started
      expect(sandbox.isStarted).toBe(false);
      expect(sandbox.state).toBeUndefined();

      // After start
      await sandbox.start();
      expect(sandbox.isStarted).toBe(true);
      expect(sandbox.state).toBe("running");

      // After fetching status
      const status = await sandbox.status();
      expect(status.state).toBe("running");
      expect(sandbox.info).toBeDefined();
      expect(sandbox.info?.name).toBe(name);

      // Cleanup
      await sandbox.stop();
      await sandbox.delete();
    });
  });
});
