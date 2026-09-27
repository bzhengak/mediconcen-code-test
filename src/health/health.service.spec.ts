import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserIdCache } from '../modules/user-id/user-id.cache.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const query = vi.fn();
  const isHealthy = vi.fn();
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  function createService(): HealthService {
    return new HealthService(
      { query } as unknown as DataSource,
      { isHealthy } as unknown as UserIdCache,
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    query.mockResolvedValue([[{ '1': 1 }]]);
    isHealthy.mockResolvedValue(true);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  it('reports both dependencies as up', async () => {
    const report = await createService().check();

    expect(report.status).toBe('ok');
    expect(report.checks.mysql.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
  });

  it('publishes only status and latency for each dependency', async () => {
    const report = await createService().check();

    expect(Object.keys(report)).toEqual(['status', 'uptimeSeconds', 'checks']);
    expect(Object.keys(report.checks.mysql)).toEqual(['status', 'latencyMs']);
    expect(Object.keys(report.checks.redis)).toEqual(['status', 'latencyMs']);
  });

  it('keeps a database failure reason out of the published report', async () => {
    query.mockRejectedValue(
      new Error('getaddrinfo EAI_AGAIN mysql:3306 - password=super-secret'),
    );

    const report = await createService().check();

    expect(report.status).toBe('degraded');
    expect(report.checks.mysql.status).toBe('down');
    expect(JSON.stringify(report)).not.toContain('EAI_AGAIN');
    expect(JSON.stringify(report)).not.toContain('super-secret');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('mysql health check failed'),
    );
  });

  it('treats a cache that does not confirm as degraded, not as an error', async () => {
    isHealthy.mockResolvedValue(false);

    const report = await createService().check();

    expect(report.status).toBe('degraded');
    expect(report.checks.redis.status).toBe('down');
  });

  it('logs one line per change of state, not one per poll', async () => {
    query.mockRejectedValue(new Error('connection lost'));
    const service = createService();

    await service.check();
    await service.check();
    await service.check();

    expect(warnSpy).toHaveBeenCalledTimes(1);

    query.mockResolvedValue([[{ '1': 1 }]]);
    await service.check();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('mysql is available again'),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is ready while MySQL answers, even with Redis down', async () => {
    isHealthy.mockResolvedValue(false);

    await expect(createService().isReady()).resolves.toBe(true);
  });

  it('is not ready when MySQL is unreachable', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    await expect(createService().isReady()).resolves.toBe(false);
  });

  it('measures each dependency in parallel', async () => {
    query.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([[{}]]), 40)),
    );
    isHealthy.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 40)),
    );

    const startedAt = Date.now();
    await createService().check();

    expect(Date.now() - startedAt).toBeLessThan(70);
  });

  it('probes MySQL with a trivial statement', async () => {
    await createService().check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
});
