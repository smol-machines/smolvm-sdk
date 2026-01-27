import { SmolvmError, parseApiError } from "./errors.js";
import type { ApiErrorResponse } from "./types.js";

/**
 * Parse Server-Sent Events from a readable stream.
 * Yields each data payload as a string.
 */
export async function* streamSSE(
  url: string,
  signal?: AbortSignal
): AsyncIterable<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    let errorBody: ApiErrorResponse;
    try {
      errorBody = (await response.json()) as ApiErrorResponse;
    } catch {
      errorBody = {
        error: `HTTP ${response.status}: ${response.statusText}`,
        code: "UNKNOWN",
      };
    }
    throw parseApiError(response.status, errorBody);
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          yield line.slice(6);
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.startsWith("data: ")) {
      yield buffer.slice(6);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE event line.
 */
export function parseSSELine(line: string): { event?: string; data?: string } {
  if (line.startsWith("event: ")) {
    return { event: line.slice(7) };
  }
  if (line.startsWith("data: ")) {
    return { data: line.slice(6) };
  }
  return {};
}

/**
 * Combine multiple async iterables into one.
 * Useful for merging log streams from multiple sources.
 */
export async function* mergeStreams<T>(
  ...iterables: AsyncIterable<T>[]
): AsyncIterable<T> {
  if (iterables.length === 0) return;
  if (iterables.length === 1) {
    yield* iterables[0];
    return;
  }

  // Use a queue-based approach for merging
  const queue: T[] = [];
  let resolveWaiting: (() => void) | null = null;
  let activeCount = iterables.length;
  let error: Error | null = null;

  // Start consuming each iterable
  const consumers = iterables.map(async (iterable) => {
    try {
      for await (const value of iterable) {
        queue.push(value);
        if (resolveWaiting) {
          const resolve = resolveWaiting;
          resolveWaiting = null;
          resolve();
        }
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    } finally {
      activeCount--;
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }
  });

  // Yield values as they arrive
  while (activeCount > 0 || queue.length > 0) {
    if (error) throw error;

    if (queue.length > 0) {
      yield queue.shift()!;
    } else if (activeCount > 0) {
      await new Promise<void>((resolve) => {
        resolveWaiting = resolve;
      });
    }
  }

  // Wait for all consumers to finish
  await Promise.all(consumers);
  if (error) throw error;
}
