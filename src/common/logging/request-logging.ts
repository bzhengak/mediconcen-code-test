export interface HttpRequest {
  method: string;
  url: string;
  requestId?: string;
}

export interface LoggingHandle {
  succeed(statusCode: number): void;
  fail(error: unknown): void;
}

export interface RequestLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ObservableLike<T> {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }): unknown;
}

/**
 * Shared by the logging interceptor and the exception filter so both describe a request
 * with the same correlation id and the same access-log format.
 */
export function describeRequest(req: HttpRequest): string {
  return `${req.method} ${req.url} (requestId=${req.requestId ?? 'unknown'})`;
}

export function startRequestLogging(
  logger: RequestLogger,
  req: HttpRequest,
): LoggingHandle {
  const startedAt = process.hrtime.bigint();

  const elapsedMs = (): string =>
    (Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(1);

  return {
    succeed(statusCode: number): void {
      const line = `${describeRequest(req)} -> ${statusCode} in ${elapsedMs()}ms`;
      if (statusCode >= 500) {
        logger.error(line);
      } else if (statusCode >= 400) {
        logger.warn(line);
      } else {
        logger.log(line);
      }
    },
    fail(error: unknown): void {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`${describeRequest(req)} -> failed: ${reason}`);
    },
  };
}
