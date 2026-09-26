import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  requestId: string;
}

interface FakeResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function createHost(requestId = 'request-1'): {
  host: ArgumentsHost;
  response: FakeResponse;
} {
  const response: FakeResponse = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        url: '/api/v1/user-id/resolve',
        requestId,
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

function statusOf(response: FakeResponse): number {
  return response.status.mock.calls[0]?.[0] as number;
}

function bodyOf(response: FakeResponse): ErrorBody {
  return response.json.mock.calls[0]?.[0] as ErrorBody;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('joins validation messages and keeps them as details', () => {
    const { host, response } = createHost();

    filter.catch(
      new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: ['id1 is required', 'id2 must be a string'],
      }),
      host,
    );

    expect(statusOf(response)).toBe(400);
    expect(bodyOf(response)).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'id1 is required; id2 must be a string',
      details: ['id1 is required', 'id2 must be a string'],
      requestId: 'request-1',
    });
  });

  it('keeps a single validation message flat', () => {
    const { host, response } = createHost();

    filter.catch(new BadRequestException('id1 is required'), host);

    expect(bodyOf(response).message).toBe('id1 is required');
    expect(bodyOf(response).details).toBeUndefined();
  });

  it('preserves the label of a framework exception', () => {
    const { host, response } = createHost();

    filter.catch(new NotFoundException('Cannot POST /api/v1/unknown'), host);

    expect(statusOf(response)).toBe(404);
    expect(bodyOf(response)).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot POST /api/v1/unknown',
    });
  });

  it('labels an exception built from a bare string', () => {
    const { host, response } = createHost();

    filter.catch(
      new HttpException('policy numbers are frozen for this month', 422),
      host,
    );

    expect(bodyOf(response)).toMatchObject({
      statusCode: 422,
      error: 'Request Failed',
      message: 'policy numbers are frozen for this month',
    });
  });

  it('answers an unexpected failure with the generic message only', () => {
    const { host, response } = createHost();

    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:3306'), host);

    expect(statusOf(response)).toBe(500);
    expect(bodyOf(response).statusCode).toBe(500);
    expect(bodyOf(response).error).toBe('Internal Server Error');
    expect(bodyOf(response).requestId).toBe('request-1');
    expect(JSON.stringify(bodyOf(response))).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(bodyOf(response))).not.toContain('10.0.0.5');
  });

  it('logs the real cause of an unexpected failure under the request id', () => {
    const { host } = createHost('lookup-42');
    const driverError = new Error('Packet sequence number wrong');
    const wrapped = new Error('Database query failed', { cause: driverError });

    filter.catch(wrapped, host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0]?.[0]);
    expect(message).toContain('requestId=lookup-42');
    expect(message).toContain(
      'Database query failed: Packet sequence number wrong',
    );
  });

  it('routes a client error to the warning log, not the error log', () => {
    const { host } = createHost();

    filter.catch(new BadRequestException('id1 is required'), host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
