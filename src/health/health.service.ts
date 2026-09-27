import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserIdCache } from '../modules/user-id/user-id.cache.js';

type Component = 'mysql' | 'redis';
type ComponentStatus = 'up' | 'down';

interface ComponentHealth {
  status: ComponentStatus;
  latencyMs: number;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: Record<Component, ComponentHealth>;
}

/**
 * Status and timing are published; the reason a dependency failed stays in the log, because a
 * driver message such as `getaddrinfo EAI_AGAIN mysql` would hand an internal host name to anyone
 * who asked. A change of state is logged once rather than on every poll, since the container
 * healthcheck asks every fifteen seconds.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly lastReported = new Map<Component, ComponentStatus>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: UserIdCache,
  ) {}

  async check(): Promise<HealthReport> {
    const [mysql, redis] = await Promise.all([
      this.measure('mysql', () => this.pingMysql()),
      this.measure('redis', () => this.cache.isHealthy()),
    ]);

    return {
      status:
        mysql.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      checks: { mysql, redis },
    };
  }

  /** MySQL is the authoritative store, so it is the only component that can make us unready. */
  async isReady(): Promise<boolean> {
    return (
      (await this.measure('mysql', () => this.pingMysql())).status === 'up'
    );
  }

  private async pingMysql(): Promise<boolean> {
    await this.dataSource.query('SELECT 1');
    return true;
  }

  private async measure(
    component: Component,
    probe: () => Promise<boolean>,
  ): Promise<ComponentHealth> {
    const startedAt = process.hrtime.bigint();
    const result = await this.attempt(probe);
    const status: ComponentStatus = result.ok ? 'up' : 'down';

    this.logChange(component, status, result.reason);
    return {
      status,
      latencyMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    };
  }

  private async attempt(
    probe: () => Promise<boolean>,
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const ok = await probe();
      return {
        ok,
        reason: ok ? undefined : 'the probe did not confirm availability',
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private logChange(
    component: Component,
    status: ComponentStatus,
    reason: string | undefined,
  ): void {
    if (this.lastReported.get(component) === status) {
      return;
    }
    this.lastReported.set(component, status);

    if (status === 'down') {
      this.logger.warn(
        `${component} health check failed: ${reason ?? 'unknown reason'}`,
      );
    } else {
      this.logger.log(`${component} is available again`);
    }
  }
}
