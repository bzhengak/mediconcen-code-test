import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  describeRequest,
  startRequestLogging,
} from '../logging/request-logging.js';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  requestId: string;
}

const GENERIC_FAILURE_MESSAGE =
  'The request could not be completed. Please retry shortly and quote the requestId if the problem persists.';

const INTERNAL_ERROR_LABEL = 'Internal Server Error';
const DEFAULT_ERROR_LABEL = 'Request Failed';

/**
 * Every error leaves this API with one shape, and a 5xx never carries a driver message or a
 * stack trace - those go to the server log under the requestId instead, so a caller can report
 * a problem without learning how the service is built.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? 'unknown';
    const isUnexpectedError = !(exception instanceof HttpException);

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = INTERNAL_ERROR_LABEL;
    let message = GENERIC_FAILURE_MESSAGE;
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      const record = (
        typeof body === 'string' ? { message: body } : body
      ) as Record<string, unknown>;
      error =
        typeof record.error === 'string' ? record.error : DEFAULT_ERROR_LABEL;
      const messages = this.asMessages(record.message);
      message = messages.join('; ');
      details = messages.length > 1 ? messages : undefined;
    }

    if (isUnexpectedError) {
      this.logger.error(
        `${describeRequest(request)} -> ${statusCode}: ${this.describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      startRequestLogging(this.logger, request).succeed(statusCode);
    }

    const responseBody: ErrorResponseBody = {
      statusCode,
      error,
      message,
      ...(details ? { details } : {}),
      requestId,
    };
    ctx.getResponse<Response>().status(statusCode).json(responseBody);
  }

  private asMessages(value: unknown): string[] {
    const list = Array.isArray(value) ? value : [value];
    const messages = list
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
    return messages.length > 0 ? messages : [GENERIC_FAILURE_MESSAGE];
  }

  /** Drivers nest the real reason one level down; surface it to the log only. */
  private describe(error: unknown): string {
    if (error instanceof Error && error.cause instanceof Error) {
      return `${error.message}: ${error.cause.message}`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
