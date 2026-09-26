import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserIdCache } from '../modules/user-id/user-id.cache.js';

export type ComponentStatus = 'up' | 'down';

export interface ComponentHealth {
  status: ComponentStatus;
  latencyMs: number;
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    mysql: ComponentHealth;
    redis: ComponentHealth;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: UserIdCache,
  ) {}

  async check(): Promise<HealthReport> {
    const [mysql, redis] = await Promise.all([
      this.checkMysql(),
      this.checkRedis(),
    ]);
    const critical = [mysql, redis].filter(
      (check) => check.status === 'down',
    ).length;

    return {
      status: critical === 0 ? 'ok' : 'degraded',
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      checks: { mysql, redis },
    };
  }

  /** MySQL is the authoritative store, so it is the only component that can make us unready. */
  async isReady(): Promise<boolean> {
    return (await this.checkMysql()).status === 'up';
  }

  private async checkMysql(): Promise<ComponentHealth> {
    return this.measure(async () => {
      await this.dataSource.query('SELECT 1');
      return true;
    });
  }

  private async checkRedis(): Promise<ComponentHealth> {
    return this.measure(async () => this.cache.isHealthy());
  }

  private async measure(
    measurement: () => Promise<boolean>,
  ): Promise<ComponentHealth> {
    const startedAt = process.hrtime.bigint();
    try {
      const healthy = await measurement();
      return {
        status: healthy ? 'up' : 'down',
        latencyMs: this.elapsedMs(startedAt),
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: this.elapsedMs(startedAt),
        detail: error instanceof Error ? error.message : 'unknown failure',
      };
    }
  }

  private elapsedMs(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  }
}
