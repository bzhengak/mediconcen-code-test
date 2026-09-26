import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ENDPOINT } from './endpoint.js';

// Point the cache at a closed port before the configuration is read, so the whole application
// runs the way it does during a Redis outage.
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '1';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('requests without Redis (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
    dataSource = app.get<DataSource>(getDataSourceToken());

    await dataSource.query('TRUNCATE TABLE user_id_mappings');
  });

  afterAll(async () => {
    await app.close();
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

  it('reports itself degraded rather than failed', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.redis.status).toBe('down');
    expect(response.body.checks.mysql.status).toBe('up');
  });

  it('stays ready because MySQL answers', async () => {
    await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
  });
});
