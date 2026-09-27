import 'reflect-metadata';
import { Type } from 'class-transformer';
import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Every numeric value gets an explicit `@Type(() => Number)`. Environment variables always
 * arrive as text, and TypeScript only emits usable `design:type` metadata for annotated
 * properties under this project's ES2023 target - relying on implicit conversion silently
 * left the ports as strings and failed validation at startup.
 */
export class AppEnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  APP_PORT: number = 3000;

  @IsIn(['error', 'warn', 'log', 'debug', 'verbose'])
  @IsOptional()
  LOG_LEVEL: string = 'log';

  @IsString()
  @IsNotEmpty()
  MYSQL_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  MYSQL_PORT: number = 3306;

  @IsString()
  @IsNotEmpty()
  MYSQL_USER: string;

  @IsString()
  @IsNotEmpty()
  MYSQL_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  MYSQL_DATABASE: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  MYSQL_POOL_SIZE: number = 10;

  // Deliberately a string: `false` in a .env file is text, and callers compare it to 'true'
  // rather than relying on a coercion that would read 'false' as truthy.
  @IsBooleanString()
  @IsOptional()
  MYSQL_LOGGING: string = 'false';

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  USER_ID_CACHE_TTL_SECONDS: number = 3600;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  USER_ID_CACHE_KEY_PREFIX: string = 'v1:user-id-mapping';
}

export function validateEnv(
  raw: Record<string, unknown>,
): AppEnvironmentVariables {
  const config = plainToInstance(AppEnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n  ');
    throw new Error(
      `Invalid environment configuration:\n  ${details}\n` +
        'Copy .env.example to .env and fill in the values before starting the application.',
    );
  }

  return config;
}
