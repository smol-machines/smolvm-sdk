import type { ApiErrorResponse } from "./types.js";

/**
 * Base error class for all smolvm SDK errors.
 */
export class SmolvmError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "SmolvmError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Resource not found (HTTP 404).
 */
export class NotFoundError extends SmolvmError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/**
 * Resource conflict (HTTP 409).
 */
export class ConflictError extends SmolvmError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

/**
 * Bad request (HTTP 400).
 */
export class BadRequestError extends SmolvmError {
  constructor(message: string) {
    super(message, "BAD_REQUEST", 400);
    this.name = "BadRequestError";
  }
}

/**
 * Request timeout (HTTP 408 or operation timeout).
 */
export class TimeoutError extends SmolvmError {
  constructor(message: string) {
    super(message, "TIMEOUT", 408);
    this.name = "TimeoutError";
  }
}

/**
 * Internal server error (HTTP 500).
 */
export class InternalError extends SmolvmError {
  constructor(message: string) {
    super(message, "INTERNAL_ERROR", 500);
    this.name = "InternalError";
  }
}

/**
 * Network or connection error.
 */
export class ConnectionError extends SmolvmError {
  constructor(message: string) {
    super(message, "CONNECTION_ERROR", 0);
    this.name = "ConnectionError";
  }
}

/**
 * Parse an API error response into the appropriate error class.
 */
export function parseApiError(
  statusCode: number,
  body: ApiErrorResponse
): SmolvmError {
  const message = body.error || "Unknown error";

  switch (statusCode) {
    case 400:
      return new BadRequestError(message);
    case 404:
      return new NotFoundError(message);
    case 408:
      return new TimeoutError(message);
    case 409:
      return new ConflictError(message);
    case 500:
    case 502:
    case 503:
      return new InternalError(message);
    default:
      return new SmolvmError(message, body.code || "UNKNOWN", statusCode);
  }
}
