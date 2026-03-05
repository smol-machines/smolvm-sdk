/**
 * E2E tests for MicroVM functionality.
 *
 * These tests require a running smolvm server.
 * Start with: smolvm serve start --listen 127.0.0.1:8080
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { SmolvmClient } from "../client.js";
import { NotFoundError, ConflictError } from "../errors.js";
import { requireServer, TEST_SERVER_URL } from "./setup.js";

function uniqueMicrovmName(prefix: string = "vm"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

class MicrovmTracker {
  private client: SmolvmClient;
  private microvms: string[] = [];

  constructor(client: SmolvmClient) {
    this.client = client;
  }

  track(name: string): void {
    this.microvms.push(name);
  }

  async cleanup(): Promise<void> {
    for (const name of this.microvms) {
      try {
        await this.client.stopMicrovm(name);
      } catch {
        // Ignore
      }
      try {
        await this.client.deleteMicrovm(name);
      } catch {
        // Ignore
      }
    }
    this.microvms = [];
  }
}

describe("MicroVM E2E Tests", () => {
  let client: SmolvmClient;
  let tracker: MicrovmTracker;

  beforeAll(async () => {
    await requireServer();
    client = new SmolvmClient(TEST_SERVER_URL);
    tracker = new MicrovmTracker(client);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("MicroVM Lifecycle", () => {
    it("should create a microvm with default and custom resources", async () => {
      // Default resources
      const name1 = uniqueMicrovmName("default");
      tracker.track(name1);
      const info1 = await client.createMicrovm({ name: name1 });
      expect(info1.name).toBe(name1);
      expect(info1.state).toBe("created");
      expect(info1.cpus).toBe(1);
      expect(info1.memoryMb).toBe(512);

      // Custom resources
      const name2 = uniqueMicrovmName("custom");
      tracker.track(name2);
      const info2 = await client.createMicrovm({
        name: name2,
        cpus: 2,
        memoryMb: 1024,
      });
      expect(info2.cpus).toBe(2);
      expect(info2.memoryMb).toBe(1024);
    });

    it("should reject duplicate microvm names", async () => {
      const name = uniqueMicrovmName("dup");
      tracker.track(name);

      await client.createMicrovm({ name });
      await expect(client.createMicrovm({ name })).rejects.toThrow(
        ConflictError
      );
    });

    it("should list microvms", async () => {
      const name = uniqueMicrovmName("list");
      tracker.track(name);

      await client.createMicrovm({ name });
      const microvms = await client.listMicrovms();

      const found = microvms.find((vm) => vm.name === name);
      expect(found).toBeDefined();
    });

    it("should return 404 for non-existent microvm", async () => {
      await expect(
        client.getMicrovm("non-existent-12345")
      ).rejects.toThrow(NotFoundError);
    });

    it("should start and stop a microvm (including idempotent operations)", async () => {
      const name = uniqueMicrovmName("startstop");
      tracker.track(name);

      await client.createMicrovm({ name });

      // Start
      let info = await client.startMicrovm(name);
      expect(info.state).toBe("running");
      expect(info.pid).toBeDefined();

      // Start again (idempotent)
      info = await client.startMicrovm(name);
      expect(info.state).toBe("running");

      // Stop
      info = await client.stopMicrovm(name);
      expect(info.state).toBe("stopped");

      // Stop again (idempotent)
      info = await client.stopMicrovm(name);
      expect(info.state).toBe("stopped");
    });

    it("should delete a microvm (stopped and running)", async () => {
      // Delete stopped
      const name1 = uniqueMicrovmName("del1");
      await client.createMicrovm({ name: name1 });
      await client.deleteMicrovm(name1);
      await expect(client.getMicrovm(name1)).rejects.toThrow(NotFoundError);

      // Delete running
      const name2 = uniqueMicrovmName("del2");
      await client.createMicrovm({ name: name2 });
      await client.startMicrovm(name2);
      await client.deleteMicrovm(name2);
      await expect(client.getMicrovm(name2)).rejects.toThrow(NotFoundError);
    });
  });

  describe("MicroVM Execution", () => {
    it("should execute a command in a running microvm", async () => {
      const name = uniqueMicrovmName("exec");
      tracker.track(name);

      await client.createMicrovm({ name });
      await client.startMicrovm(name);

      const result = await client.execMicrovm(name, {
        command: ["echo", "hello"],
      });

      expect(result.exit_code).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.stderr).toBe("");
    });

    it("should capture exit codes", async () => {
      const name = uniqueMicrovmName("exit");
      tracker.track(name);

      await client.createMicrovm({ name });
      await client.startMicrovm(name);

      expect((await client.execMicrovm(name, { command: ["true"] })).exit_code).toBe(0);
      expect((await client.execMicrovm(name, { command: ["false"] })).exit_code).toBe(1);
      expect((await client.execMicrovm(name, { command: ["sh", "-c", "exit 42"] })).exit_code).toBe(42);
    });

    it("should capture stderr", async () => {
      const name = uniqueMicrovmName("stderr");
      tracker.track(name);

      await client.createMicrovm({ name });
      await client.startMicrovm(name);

      const result = await client.execMicrovm(name, {
        command: ["sh", "-c", "echo error >&2"],
      });

      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("error");
    });

    it("should support env vars and workdir", async () => {
      const name = uniqueMicrovmName("envwd");
      tracker.track(name);

      await client.createMicrovm({ name });
      await client.startMicrovm(name);

      // Env vars
      const envResult = await client.execMicrovm(name, {
        command: ["sh", "-c", "echo $MY_VAR"],
        env: [{ name: "MY_VAR", value: "test" }],
      });
      expect(envResult.stdout.trim()).toBe("test");

      // Workdir
      const wdResult = await client.execMicrovm(name, {
        command: ["pwd"],
        workdir: "/tmp",
      });
      expect(wdResult.stdout.trim()).toBe("/tmp");
    });

    it("should fail to exec in a stopped microvm", async () => {
      const name = uniqueMicrovmName("stopped");
      tracker.track(name);

      await client.createMicrovm({ name });

      await expect(
        client.execMicrovm(name, { command: ["echo", "hello"] })
      ).rejects.toThrow(ConflictError);
    });
  });
});
