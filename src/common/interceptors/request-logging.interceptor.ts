import { Logger } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { startRequestLogging } from '../logging/request-logging.js';

export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const handle = startRequestLogging(this.logger, request);

    return next.handle().pipe(
      map((value: unknown) => {
        handle.succeed(http.getResponse<Response>().statusCode);
        return value;
      }),
    );
  }
}
