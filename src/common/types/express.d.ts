declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id attached by requestIdMiddleware, echoed in every response. */
    requestId?: string;
  }
}

export {};
