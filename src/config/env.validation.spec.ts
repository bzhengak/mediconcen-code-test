import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const REQUIRED = {
  MYSQL_HOST: 'mysql',
  MYSQL_USER: 'app_user',
  MYSQL_PASSWORD: 'secret',
  MYSQL_DATABASE: 'mediconcen_code_test',
  REDIS_HOST: 'redis',
};

describe('validateEnv', () => {
  it('converts the numeric variables that always arrive as text', () => {
    const env = validateEnv({
      ...REQUIRED,
      APP_PORT: '3000',
      MYSQL_PORT: '3307',
      MYSQL_POOL_SIZE: '25',
      REDIS_PORT: '6380',
      USER_ID_CACHE_TTL_SECONDS: '60',
    });

    expect(env.APP_PORT).toBe(3000);
    expect(env.MYSQL_PORT).toBe(3307);
    expect(env.MYSQL_POOL_SIZE).toBe(25);
    expect(env.REDIS_PORT).toBe(6380);
    expect(env.USER_ID_CACHE_TTL_SECONDS).toBe(60);
  });

  it('applies the documented defaults when a variable is absent', () => {
    const env = validateEnv(REQUIRED);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      APP_PORT: 3000,
      LOG_LEVEL: 'log',
      MYSQL_PORT: 3306,
      MYSQL_POOL_SIZE: 10,
      REDIS_PORT: 6379,
      USER_ID_CACHE_TTL_SECONDS: 3600,
      USER_ID_CACHE_KEY_PREFIX: 'v1:user-id-mapping',
    });
  });

  it('names every required variable that is missing', () => {
    expect(() => validateEnv({})).toThrow(
      /MYSQL_HOST[\s\S]*MYSQL_USER[\s\S]*MYSQL_PASSWORD[\s\S]*MYSQL_DATABASE[\s\S]*REDIS_HOST/,
    );
  });

  it('points at .env.example when startup cannot proceed', () => {
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });

  it('rejects a port outside the usable range', () => {
    expect(() => validateEnv({ ...REQUIRED, APP_PORT: '70000' })).toThrow(
      /APP_PORT/,
    );
  });

  it('rejects a pool size that would exhaust the server', () => {
    expect(() => validateEnv({ ...REQUIRED, MYSQL_POOL_SIZE: '500' })).toThrow(
      /MYSQL_POOL_SIZE/,
    );
  });

  it('rejects a log level the application does not emit', () => {
    expect(() => validateEnv({ ...REQUIRED, LOG_LEVEL: 'trace' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('keeps MYSQL_LOGGING as text so "false" is not read as truthy', () => {
    expect(
      validateEnv({ ...REQUIRED, MYSQL_LOGGING: 'false' }).MYSQL_LOGGING,
    ).toBe('false');
  });

  it('rejects a value that is not a boolean written as text', () => {
    expect(() => validateEnv({ ...REQUIRED, MYSQL_LOGGING: 'nope' })).toThrow(
      /MYSQL_LOGGING/,
    );
  });

  it('allows Redis to run without a password', () => {
    expect(
      validateEnv({ ...REQUIRED, REDIS_PASSWORD: '' }).REDIS_PASSWORD,
    ).toBe('');
  });
});
