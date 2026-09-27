import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { ENDPOINT } from '../endpoint.js';

/**
 * This suite only means something when Redis genuinely cannot be reached, so the endpoint comes
 * from the environment rather than from anything in this file: `npm run test:e2e:outage` is
 * started with REDIS_HOST / REDIS_PORT pointing at a port that refuses connections (see the
 * `e2e-outage` service in docker-compose.test.yml). The first case asserts that the outage is in
 * effect, so the suite fails loudly against a live Redis instead of passing for the wrong reason.
 */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('requests during a Redis outage (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  async function rowCount(): Promise<number> {
    const [row] = await dataSource.query(
      'SELECT COUNT(*) AS count FROM user_id_mappings',
    );
    return Number(row.count);
  }

  async function health(): Promise<{
    status: string;
    checks: { mysql: { status: string }; redis: { status: string } };
  }> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    return response.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());

    await dataSource.query('TRUNCATE TABLE user_id_mappings');
  });

  afterAll(async () => {
    await app.close();
  });

  it('is running against an unreachable Redis', async () => {
    expect((await health()).checks.redis.status).toBe('down');
  });

  it('still stores and repeats the same userID from MySQL alone', async () => {
    const first = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ id1: 'NO-REDIS-1', id2: 'NO-REDIS-2' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ id1: 'NO-REDIS-1', id2: 'NO-REDIS-2' })
      .expect(200);

    expect(first.body.userID).toMatch(UUID_V4);
    expect(second.body.userID).toBe(first.body.userID);
    await expect(rowCount()).resolves.toBe(1);
  });

  it('answers a new pair and reads it back through MySQL', async () => {
    const response = await request(app.getHttpServer())
      .post(ENDPOINT)
      .send({ id1: 'NO-REDIS-3', id2: 'NO-REDIS-4' })
      .expect(200);

    const [row] = await dataSource.query(
      'SELECT user_id FROM user_id_mappings WHERE id1 = ? AND id2 = ?',
      ['NO-REDIS-3', 'NO-REDIS-4'],
    );
    expect(row.user_id).toBe(response.body.userID);
  });

  it('reports degraded rather than failed, and stays ready', async () => {
    const report = await health();

    expect(report.status).toBe('degraded');
    expect(report.checks.mysql.status).toBe('up');
    expect(report.checks.redis.status).toBe('down');

    await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
  });
});
