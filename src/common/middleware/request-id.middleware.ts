import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Reuses an inbound X-Request-Id so a caller can correlate its own log with ours. */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const trimmed = typeof inbound === 'string' ? inbound.trim() : '';
  const requestId = trimmed === '' ? randomUUID() : trimmed;

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
