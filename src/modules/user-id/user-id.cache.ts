import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'node:crypto';
import { Redis } from 'ioredis';

type CacheStatus = 'connecting' | 'ready' | 'closed';

/** ioredis defaults are tuned for a queueing client; this cache must fail fast instead. */
const CONNECT_TIMEOUT_MS = 500;
const COMMAND_TIMEOUT_MS = 250;
const MAX_ATTEMPTS_PER_COMMAND = 1;
const RECONNECT_DELAY_MS = 2000;
/** Jitter keeps a batch of warm-up requests from expiring on the same tick. */
const MAX_TTL_JITTER_SECONDS = 60;

/**
 * Read-through cache for the (id1, id2) -> userID mapping.
 *
 * MySQL stays the only source of truth: every method here resolves normally even when Redis
 * is unreachable, so a cache outage costs latency and nothing else. A miss is therefore never
 * cached - only confirmed values are - and stored pairs never change, so a hit cannot be stale.
 */
@Injectable()
export class UserIdCache implements OnModuleDestroy {
  private readonly logger = new Logger(UserIdCache.name);
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;
  private status: CacheStatus = 'connecting';
  private warnedWhileUnavailable = false;

  constructor(config: ConfigService) {
    this.keyPrefix = config.getOrThrow<string>('USER_ID_CACHE_KEY_PREFIX');
    this.ttlSeconds = config.get<number>('USER_ID_CACHE_TTL_SECONDS') ?? 0;

    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.get<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: MAX_ATTEMPTS_PER_COMMAND,
      enableOfflineQueue: false,
      retryStrategy: () => RECONNECT_DELAY_MS,
    });

    this.redis.on('ready', () => {
      this.status = 'ready';
      this.warnedWhileUnavailable = false;
      this.logger.log('redis cache ready');
    });

    this.redis.on('end', () => {
      this.status = 'connecting';
    });

    // Without this listener ioredis re-emits connection failures as unhandled errors,
    // which would take the whole process down.
    this.redis.on('error', (error: Error) => {
      this.status = 'connecting';
      this.warnOnceUnavailable('connect', error);
    });
  }

  get available(): boolean {
    return this.status === 'ready';
  }

  async get(id1: string, id2: string): Promise<string | null> {
    if (!this.available || this.ttlSeconds === 0) {
      return null;
    }
    return this.run('GET', () => this.redis.get(this.keyOf(id1, id2)));
  }

  remember(id1: string, id2: string, userId: string): void {
    if (!this.available || this.ttlSeconds === 0) {
      return;
    }
    const ttl = this.ttlSeconds + randomInt(0, this.jitterBound());
    void this.run('SETEX', () =>
      this.redis.set(this.keyOf(id1, id2), userId, 'EX', ttl),
    );
  }

  async isHealthy(): Promise<boolean> {
    return (
      this.status === 'ready' &&
      (await this.run('PING', () => this.redis.ping())) !== null
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.status = 'closed';
    // A client that is already gone rejects here; losing that would be noise, not a failure.
    await this.redis.quit().catch(() => undefined);
  }

  /** Never rejects: the database is authoritative, so a cache failure must not surface as a 500. */
  private async run<T>(
    operation: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      this.warnOnceUnavailable(operation, error);
      return null;
    }
  }

  private warnOnceUnavailable(operation: string, error: unknown): void {
    if (this.warnedWhileUnavailable) {
      return;
    }
    this.warnedWhileUnavailable = true;
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `redis cache unavailable during ${operation}, serving from MySQL only: ${reason}`,
    );
  }

  private jitterBound(): number {
    return Math.min(
      MAX_TTL_JITTER_SECONDS,
      Math.max(1, Math.ceil(this.ttlSeconds / 10)),
    );
  }

  /** Hashing the pair keeps Redis keys a fixed length and free of separator ambiguity. */
  private keyOf(id1: string, id2: string): string {
    const digest = createHash('sha256')
      .update(JSON.stringify([id1, id2]))
      .digest('hex');
    return `${this.keyPrefix}:${digest}`;
  }
}
