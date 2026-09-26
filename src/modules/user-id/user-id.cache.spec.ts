import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserIdCache } from './user-id.cache.js';

const { RedisMock } = vi.hoisted(() => {
  class RedisMock {
    static instances: RedisMock[] = [];
    readonly options: Record<string, unknown>;
    readonly listeners = new Map<string, Array<(error?: unknown) => void>>();
    readonly get = vi.fn();
    readonly set = vi.fn();
    readonly ping = vi.fn();
    readonly quit = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      RedisMock.instances.push(this);
    }

    on(event: string, callback: (error?: unknown) => void): this {
      const callbacks = this.listeners.get(event) ?? [];
      callbacks.push(callback);
      this.listeners.set(event, callbacks);
      return this;
    }

    emit(event: string, error?: unknown): void {
      for (const callback of this.listeners.get(event) ?? []) {
        callback(error);
      }
    }
  }

  return { RedisMock };
});

vi.mock('ioredis', () => ({ Redis: RedisMock }));

type RedisClient = InstanceType<typeof RedisMock>;

const ID1 = 'ABC123';
const ID2 = 'XYZ456';
const KEY_PREFIX = 'v1:test';
const REDIS_DOWN = new Error('connect ECONNREFUSED 127.0.0.1:6379');

function expectedKey(id1: string, id2: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([id1, id2]))
    .digest('hex');
  return `${KEY_PREFIX}:${digest}`;
}

/** A cache wired to its fake client, optionally already reporting a live connection. */
function build(
  overrides: Record<string, unknown> = {},
  connected = true,
): { cache: UserIdCache; redis: RedisClient } {
  const values: Record<string, unknown> = {
    REDIS_HOST: 'redis',
    REDIS_PORT: 6379,
    USER_ID_CACHE_KEY_PREFIX: KEY_PREFIX,
    USER_ID_CACHE_TTL_SECONDS: 3600,
    ...overrides,
  };

  const config = {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing configuration: ${key}`);
      }
      return value;
    },
    get: (key: string) => values[key],
  } as unknown as ConfigService;

  const cache = new UserIdCache(config);
  const redis = RedisMock.instances.at(-1);
  if (!redis) {
    throw new Error('no Redis client was constructed');
  }
  if (connected) {
    redis.emit('ready');
  }

  return { cache, redis };
}

describe('UserIdCache', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    RedisMock.instances.length = 0;
    vi.clearAllMocks();
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  it('connects with fail-fast settings so Redis can never delay a request', () => {
    build({ REDIS_PASSWORD: 'secret' }, false);

    expect(RedisMock.instances[0]?.options).toMatchObject({
      host: 'redis',
      port: 6379,
      password: 'secret',
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
      commandTimeout: 250,
    });
  });

  it('leaves the password unset when Redis has none', () => {
    build({}, false);

    expect(RedisMock.instances[0]?.options.password).toBeUndefined();
  });

  it('does not issue a command until the connection is ready', async () => {
    const { cache, redis } = build({}, false);

    await expect(cache.get(ID1, ID2)).resolves.toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
    expect(cache.available).toBe(false);
  });

  it('reads a warm value under a hashed key that hides the identifiers', async () => {
    const { cache, redis } = build();
    redis.get.mockResolvedValue('stored-user-id');

    await expect(cache.get('POLICY-99999', 'CLIENT-12345')).resolves.toBe(
      'stored-user-id',
    );

    const key = String(redis.get.mock.calls[0]?.[0]);
    expect(key).toBe(expectedKey('POLICY-99999', 'CLIENT-12345'));
    expect(key).not.toContain('POLICY-99999');
    expect(key).toMatch(new RegExp(`^${KEY_PREFIX}:[0-9a-f]{64}$`));
  });

  it('stores a value with a TTL inside the configured jitter window', () => {
    const { cache, redis } = build();
    redis.set.mockResolvedValue('OK');

    cache.remember(ID1, ID2, 'new-user-id');

    expect(redis.set).toHaveBeenCalledWith(
      expectedKey(ID1, ID2),
      'new-user-id',
      'EX',
      expect.any(Number),
    );

    const ttl = Number(redis.set.mock.calls[0]?.[3]);
    expect(ttl).toBeGreaterThanOrEqual(3600);
    expect(ttl).toBeLessThan(3660);
  });

  it('serves null rather than throwing when Redis fails mid-request', async () => {
    const { cache, redis } = build();
    redis.get.mockRejectedValue(REDIS_DOWN);

    await expect(cache.get(ID1, ID2)).resolves.toBeNull();
  });

  it('never lets a failed write surface to the caller', () => {
    const { cache, redis } = build();
    redis.set.mockRejectedValue(REDIS_DOWN);

    expect(() => cache.remember(ID1, ID2, 'new-user-id')).not.toThrow();
  });

  it('disables caching entirely when the TTL is zero', async () => {
    const { cache, redis } = build({ USER_ID_CACHE_TTL_SECONDS: 0 });

    await expect(cache.get(ID1, ID2)).resolves.toBeNull();
    cache.remember(ID1, ID2, 'new-user-id');

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('warns once per outage instead of per failed command', () => {
    const { redis } = build({}, false);

    redis.emit('error', REDIS_DOWN);
    redis.emit('error', REDIS_DOWN);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns again after a reconnect if Redis drops out a second time', () => {
    const { redis } = build({}, false);

    redis.emit('error', REDIS_DOWN);
    redis.emit('ready');
    redis.emit('error', REDIS_DOWN);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('reports health from a live ping', async () => {
    const { cache, redis } = build({}, false);
    expect(await cache.isHealthy()).toBe(false);

    redis.emit('ready');
    redis.ping.mockResolvedValue('PONG');
    expect(await cache.isHealthy()).toBe(true);

    redis.emit('end');
    expect(await cache.isHealthy()).toBe(false);
  });

  it('closes the connection on shutdown', async () => {
    const { cache, redis } = build();
    redis.quit.mockResolvedValue('OK');

    await expect(cache.onModuleDestroy()).resolves.toBeUndefined();
    expect(redis.quit).toHaveBeenCalled();
  });

  it('survives a shutdown when Redis is already gone', async () => {
    const { cache, redis } = build();
    redis.quit.mockRejectedValue(REDIS_DOWN);

    await expect(cache.onModuleDestroy()).resolves.toBeUndefined();
  });
});
