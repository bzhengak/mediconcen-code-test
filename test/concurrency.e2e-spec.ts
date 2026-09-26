import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ENDPOINT } from './endpoint.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONCURRENCY = 30;

describe('concurrent requests (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let cache: Redis;
  let url: string;

  async function resolve(
    id1: string,
    id2: string,
  ): Promise<{ status: number; userID: string }> {
    const response = await fetch(`${url}${ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id1, id2 }),
    });
    const body = (await response.json()) as { userID: string };
    return { status: response.status, userID: body.userID };
  }

  async function rowCount(): Promise<number> {
    const [row] = await dataSource.query(
      'SELECT COUNT(*) AS count FROM user_id_mappings',
    );
    return Number(row.count);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    // A real listener is required: sharing one supertest socket would serialise the race.
    await app.listen(0);
    url = await app.getUrl();

    dataSource = app.get<DataSource>(getDataSourceToken());
    const config = app.get(ConfigService);
    cache = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    await cache.connect();
  });

  beforeEach(async () => {
    // Both stores start empty, so no cached value can answer for a row that is gone.
    await dataSource.query('TRUNCATE TABLE user_id_mappings');
    await cache.flushdb();
  });

  afterAll(async () => {
    await cache.quit();
    await app.close();
  });

  it('resolves a racing batch to one stored userID that later calls repeat', async () => {
    const attempts = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        resolve('RACE-001', 'RACE-999'),
      ),
    );

    expect(attempts.map((attempt) => attempt.status)).toEqual(
      Array.from({ length: CONCURRENCY }, () => 200),
    );

    const userIDs = new Set(attempts.map((attempt) => attempt.userID));
    expect(userIDs.size).toBe(1);
    expect([...userIDs][0]).toMatch(UUID_V4);
    await expect(rowCount()).resolves.toBe(1);

    const followUp = await resolve('RACE-001', 'RACE-999');
    expect(followUp.userID).toBe([...userIDs][0]);
  });

  it('keeps racing pairs distinct from each other', async () => {
    const attempts = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_unused, index) =>
        resolve(`BATCH-${index}`, 'BATCH-TOTAL'),
      ),
    );

    expect(new Set(attempts.map((attempt) => attempt.userID)).size).toBe(
      CONCURRENCY,
    );
    await expect(rowCount()).resolves.toBe(CONCURRENCY);
  });

  it('reports a lost race as a success rather than a conflict', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => resolve('SAME-PAIR', 'SAME-PAIR')),
    );

    expect(attempts.every((attempt) => attempt.status === 200)).toBe(true);
    await expect(rowCount()).resolves.toBe(1);
  });
});
