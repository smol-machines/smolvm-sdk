/**
 * E2E tests for Machine functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve start --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Machine, withMachine, quickExec } from "../machine.js";
import { NotFoundError, ConflictError } from "../errors.js";
import {
  requireServer,
  uniqueMachineName,
  MachineTracker,
  TEST_SERVER_URL,
  TEST_IMAGE,
  ensureTestImage,
} from "./setup.js";

describe("Machine E2E Tests", () => {
  const tracker = new MachineTracker();

  beforeAll(async () => {
    await requireServer();
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("Machine Lifecycle", () => {
    it("should create, start, stop, and delete a machine", async () => {
      const name = uniqueMachineName("lifecycle");
      const machine = new Machine({ name, serverUrl: TEST_SERVER_URL });

      await machine.start();
      expect(machine.isStarted).toBe(true);
      expect(machine.state).toBe("running");

      const status = await machine.status();
      expect(status.name).toBe(name);
      expect(status.state).toBe("running");

      await machine.stop();
      expect(machine.isStarted).toBe(false);

      await machine.delete();
      await expect(machine.status()).rejects.toThrow(NotFoundError);
    });

    it("should handle idempotent start and stop", async () => {
      const name = uniqueMachineName("idempotent");
      const machine = new Machine({ name, serverUrl: TEST_SERVER_URL });

      await machine.start();
      await machine.start(); // Second start is no-op
      expect(machine.isStarted).toBe(true);

      await machine.stop();
      await machine.stop(); // Second stop is no-op
      expect(machine.isStarted).toBe(false);

      await machine.delete();
    });

    it("should reject duplicate machine names", async () => {
      const name = uniqueMachineName("duplicate");
      const machine1 = await tracker.create(name);
      expect(machine1.isStarted).toBe(true);

      const machine2 = new Machine({ name, serverUrl: TEST_SERVER_URL });
      await expect(machine2.start()).rejects.toThrow(ConflictError);
    });
  });

  describe("Machine Execution", () => {
    it("should execute a simple command", async () => {
      const machine = await tracker.create();

      const result = await machine.exec(["echo", "hello world"]);

      expect(result.stdout.trim()).toBe("hello world");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
    });

    it("should capture exit codes", async () => {
      const machine = await tracker.create();

      expect((await machine.exec(["true"])).exitCode).toBe(0);
      expect((await machine.exec(["false"])).exitCode).toBe(1);
      expect((await machine.exec(["sh", "-c", "exit 42"])).exitCode).toBe(42);
    });

    it("should capture stderr", async () => {
      const machine = await tracker.create();

      const result = await machine.exec(["sh", "-c", "echo error >&2"]);

      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("error");
    });

    it("should support env vars and workdir", async () => {
      const machine = await tracker.create();

      // Env vars
      const envResult = await machine.exec(["sh", "-c", "echo $VAR1-$VAR2"], {
        env: { VAR1: "one", VAR2: "two" },
      });
      expect(envResult.stdout.trim()).toBe("one-two");

      // Workdir
      const wdResult = await machine.exec(["pwd"], { workdir: "/tmp" });
      expect(wdResult.stdout.trim()).toBe("/tmp");
    });
  });

  describe("Machine Run (Container Image)", () => {
    let runMachine: Machine;

    beforeAll(async () => {
      runMachine = await Machine.create({
        name: uniqueMachineName("run-tests"),
        serverUrl: TEST_SERVER_URL,
      });
      await ensureTestImage(runMachine);
    });

    afterAll(async () => {
      try {
        await runMachine.stop();
      } catch {
        // Ignore
      }
      try {
        await runMachine.delete();
      } catch {
        // Ignore
      }
    });

    it("should run a command in a container image", async () => {
      const result = await runMachine.run(TEST_IMAGE, [
        "cat",
        "/etc/alpine-release",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+/);
    });

    it("should pass env vars to container run", async () => {
      const result = await runMachine.run(
        TEST_IMAGE,
        ["sh", "-c", "echo $CONTAINER_VAR"],
        { env: { CONTAINER_VAR: "container-test" } }
      );

      expect(result.stdout.trim()).toBe("container-test");
    });
  });

  describe("Helper Functions", () => {
    it("withMachine should create, use, and cleanup automatically", async () => {
      const name = uniqueMachineName("with-machine");

      const result = await withMachine(
        { name, serverUrl: TEST_SERVER_URL },
        async (machine) => {
          expect(machine.isStarted).toBe(true);
          return machine.exec(["echo", "test"]);
        }
      );

      expect(result.stdout.trim()).toBe("test");

      // Verify machine was deleted
      const client = new Machine({ name, serverUrl: TEST_SERVER_URL }).client;
      await expect(client.getMachine(name)).rejects.toThrow(NotFoundError);
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
