import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ENDPOINT } from './endpoint.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('POST /api/v1/user-id/resolve (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: Redis;
  let keyPrefix: string;

  function cacheKey(id1: string, id2: string): string {
    return `${keyPrefix}:${createHash('sha256')
      .update(JSON.stringify([id1, id2]))
      .digest('hex')}`;
  }

  async function rowCount(): Promise<number> {
    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*) AS count FROM user_id_mappings',
    );
    return Number(count);
  }

  async function storedUserId(
    id1: string,
    id2: string,
  ): Promise<string | null> {
    const [row] = await dataSource.query(
      'SELECT user_id FROM user_id_mappings WHERE id1 = ? AND id2 = ?',
      [id1, id2],
    );
    return row?.user_id ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    // Read the same resolved configuration the application uses, so a change in .env or in the
    // defaults cannot leave the test asserting against a different Redis or key namespace.
    const config = app.get(ConfigService);
    keyPrefix = config.getOrThrow<string>('USER_ID_CACHE_KEY_PREFIX');

    dataSource = app.get<DataSource>(getDataSourceToken());
    redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
  });

  function resolve(id1: string, id2: string) {
    return request(app.getHttpServer()).post(ENDPOINT).send({ id1, id2 });
  }

  describe('happy path', () => {
    beforeEach(async () => {
      await dataSource.query('TRUNCATE TABLE user_id_mappings');
      await redis.flushdb();
    });

    it('returns the generated userID for a new pair', async () => {
      const response = await resolve('ABC123', 'XYZ456').expect(200);

      expect(response.body).toEqual({
        userID: expect.stringMatching(UUID_V4),
      });
      expect(response.headers['x-request-id']).toBeTypeOf('string');
    });

    it('persists the pair with its userID', async () => {
      const { body } = await resolve('ABC123', 'XYZ456');

      await expect(storedUserId('ABC123', 'XYZ456')).resolves.toBe(body.userID);
      await expect(rowCount()).resolves.toBe(1);
    });

    it('returns the same userID on the next call and adds no row', async () => {
      const first = await resolve('ABC123', 'XYZ456');
      const second = await resolve('ABC123', 'XYZ456');

      expect(second.body.userID).toBe(first.body.userID);
      expect(second.headers['content-type']).toMatch(/application\/json/);
      await expect(rowCount()).resolves.toBe(1);
    });

    it('keeps the userID after the cache entry is dropped', async () => {
      const first = await resolve('ABC123', 'XYZ456');
      await redis.del(cacheKey('ABC123', 'XYZ456'));

      const second = await resolve('ABC123', 'XYZ456');

      expect(second.body.userID).toBe(first.body.userID);
    });

    it('warms the cache so a repeat does not need MySQL', async () => {
      const { body } = await resolve('ABC123', 'XYZ456');

      await expect(redis.get(cacheKey('ABC123', 'XYZ456'))).resolves.toBe(
        body.userID,
      );
      expect(await redis.ttl(cacheKey('ABC123', 'XYZ456'))).toBeGreaterThan(0);
    });

    it('stores pairs that differ only by letter case as two records', async () => {
      const upper = await resolve('ABC123', 'XYZ456');
      const lower = await resolve('abc123', 'XYZ456');

      expect(lower.body.userID).not.toBe(upper.body.userID);
      await expect(rowCount()).resolves.toBe(2);
    });

    it('accepts identifiers that other insurers use verbatim', async () => {
      await expect(resolve('保單-A1', 'POLICY 2026')).resolves.toMatchObject({
        status: 200,
      });
      await expect(
        resolve('a'.repeat(64), 'b'.repeat(64)),
      ).resolves.toMatchObject({
        status: 200,
      });
    });
  });

  describe('validation', () => {
    it.each([
      ['an empty body', {}],
      ['a missing id2', { id1: 'ABC123' }],
      ['a missing id1', { id2: 'XYZ456' }],
      ['an empty id1', { id1: '', id2: 'XYZ456' }],
      ['a whitespace id2', { id1: 'ABC123', id2: '   ' }],
      ['a numeric id1', { id1: 123, id2: 'XYZ456' }],
      ['a null id2', { id1: 'ABC123', id2: null }],
      ['an array id1', { id1: ['ABC123'], id2: 'XYZ456' }],
      ['an over-long id2', { id1: 'ABC123', id2: 'x'.repeat(65) }],
      ['a control character', { id1: 'ABC\n123', id2: 'XYZ456' }],
      ['an unexpected property', { id1: 'ABC123', id2: 'XYZ456', note: 'x' }],
    ])('rejects %s with 400', async (_label, payload) => {
      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send(payload)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(response.body.message).toBeTypeOf('string');
      expect(response.body.requestId).toBeTypeOf('string');
    });

    it('names the identifier that failed', async () => {
      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .send({ id1: '', id2: '   ' })
        .expect(400);

      expect(response.body.message).toContain('id1 is required');
      expect(response.body.message).toContain('id2 is required');
    });

    it('refuses a request with no body at all', async () => {
      await request(app.getHttpServer()).post(ENDPOINT).expect(400);
    });
  });

  describe('error shaping', () => {
    it('answers an unknown route with the same error shape', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/not-a-route')
        .send({ id1: 'ABC123', id2: 'XYZ456' })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
      });
      expect(JSON.stringify(response.body)).not.toContain('at ');
    });

    it('reuses a caller-supplied request id', async () => {
      const response = await request(app.getHttpServer())
        .post(ENDPOINT)
        .set('x-request-id', 'caller-trace-77')
        .send({ id1: 'ABC123', id2: 'XYZ456' })
        .expect(200);

      expect(response.headers['x-request-id']).toBe('caller-trace-77');
    });
  });

  describe('health', () => {
    it('reports both dependencies as up', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks.mysql.status).toBe('up');
      expect(response.body.checks.redis.status).toBe('up');
    });

    it('passes the readiness probe', async () => {
      await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    });

    it('serves the OpenAPI document', async () => {
      const response = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);

      expect(response.body.paths[ENDPOINT].post).toBeTypeOf('object');
    });
  });
});
