/**
 * E2E tests for Machine functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve start --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { SmolvmClient } from "../client.js";
import { NotFoundError, ConflictError } from "../errors.js";
import { requireServer, TEST_SERVER_URL } from "./setup.js";

function uniqueMachineName(prefix: string = "vm"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

class MachineTracker {
  private client: SmolvmClient;
  private machines: string[] = [];

  constructor(client: SmolvmClient) {
    this.client = client;
  }

  track(name: string): void {
    this.machines.push(name);
  }

  async cleanup(): Promise<void> {
    for (const name of this.machines) {
      try {
        await this.client.stopMachine(name);
      } catch {
        // Ignore
      }
      try {
        await this.client.deleteMachine(name);
      } catch {
        // Ignore
      }
    }
    this.machines = [];
  }
}

describe("Machine E2E Tests", () => {
  let client: SmolvmClient;
  let tracker: MachineTracker;

  beforeAll(async () => {
    await requireServer();
    client = new SmolvmClient(TEST_SERVER_URL);
    tracker = new MachineTracker(client);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("Machine Lifecycle", () => {
    it("should create a machine with default and custom resources", async () => {
      // Default resources
      const name1 = uniqueMachineName("default");
      tracker.track(name1);
      const info1 = await client.createMachine({ name: name1 });
      expect(info1.name).toBe(name1);
      expect(info1.state).toBe("created");
      expect(info1.cpus).toBe(1);
      expect(info1.memoryMb).toBe(512);

      // Custom resources
      const name2 = uniqueMachineName("custom");
      tracker.track(name2);
      const info2 = await client.createMachine({
        name: name2,
        cpus: 2,
        memoryMb: 1024,
      });
      expect(info2.cpus).toBe(2);
      expect(info2.memoryMb).toBe(1024);
    });

    it("should reject duplicate machine names", async () => {
      const name = uniqueMachineName("dup");
      tracker.track(name);

      await client.createMachine({ name });
      await expect(client.createMachine({ name })).rejects.toThrow(
        ConflictError
      );
    });

    it("should list machines", async () => {
      const name = uniqueMachineName("list");
      tracker.track(name);

      await client.createMachine({ name });
      const machines = await client.listMachines();

      const found = machines.find((vm) => vm.name === name);
      expect(found).toBeDefined();
    });

    it("should return 404 for non-existent machine", async () => {
      await expect(
        client.getMachine("non-existent-12345")
      ).rejects.toThrow(NotFoundError);
    });

    it("should start and stop a machine (including idempotent operations)", async () => {
      const name = uniqueMachineName("startstop");
      tracker.track(name);

      await client.createMachine({ name });

      // Start
      let info = await client.startMachine(name);
      expect(info.state).toBe("running");
      expect(info.pid).toBeDefined();

      // Start again (idempotent)
      info = await client.startMachine(name);
      expect(info.state).toBe("running");

      // Stop
      info = await client.stopMachine(name);
      expect(info.state).toBe("stopped");

      // Stop again (idempotent)
      info = await client.stopMachine(name);
      expect(info.state).toBe("stopped");
    });

    it("should delete a machine (stopped and running)", async () => {
      // Delete stopped
      const name1 = uniqueMachineName("del1");
      await client.createMachine({ name: name1 });
      await client.deleteMachine(name1);
      await expect(client.getMachine(name1)).rejects.toThrow(NotFoundError);

      // Delete running
      const name2 = uniqueMachineName("del2");
      await client.createMachine({ name: name2 });
      await client.startMachine(name2);
      await client.deleteMachine(name2);
      await expect(client.getMachine(name2)).rejects.toThrow(NotFoundError);
    });
  });

  describe("Machine Execution", () => {
    it("should execute a command in a running machine", async () => {
      const name = uniqueMachineName("exec");
      tracker.track(name);

      await client.createMachine({ name });
      await client.startMachine(name);

      const result = await client.execMachine(name, {
        command: ["echo", "hello"],
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.stderr).toBe("");
    });

    it("should capture exit codes", async () => {
      const name = uniqueMachineName("exit");
      tracker.track(name);

      await client.createMachine({ name });
      await client.startMachine(name);

      expect((await client.execMachine(name, { command: ["true"] })).exitCode).toBe(0);
      expect((await client.execMachine(name, { command: ["false"] })).exitCode).toBe(1);
      expect((await client.execMachine(name, { command: ["sh", "-c", "exit 42"] })).exitCode).toBe(42);
    });

    it("should capture stderr", async () => {
      const name = uniqueMachineName("stderr");
      tracker.track(name);

      await client.createMachine({ name });
      await client.startMachine(name);

      const result = await client.execMachine(name, {
        command: ["sh", "-c", "echo error >&2"],
      });

      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("error");
    });

    it("should support env vars and workdir", async () => {
      const name = uniqueMachineName("envwd");
      tracker.track(name);

      await client.createMachine({ name });
      await client.startMachine(name);

      // Env vars
      const envResult = await client.execMachine(name, {
        command: ["sh", "-c", "echo $MY_VAR"],
        env: [{ name: "MY_VAR", value: "test" }],
      });
      expect(envResult.stdout.trim()).toBe("test");

      // Workdir
      const wdResult = await client.execMachine(name, {
        command: ["pwd"],
        workdir: "/tmp",
      });
      expect(wdResult.stdout.trim()).toBe("/tmp");
    });

    it("should fail to exec in a stopped machine", async () => {
      const name = uniqueMachineName("stopped");
      tracker.track(name);

      await client.createMachine({ name });

      await expect(
        client.execMachine(name, { command: ["echo", "hello"] })
      ).rejects.toThrow(ConflictError);
    });
  });
});
