import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { validateEnv } from './config/env.validation.js';
import { CreateUserIdMappings1790438400000 } from './migrations/1790438400000-CreateUserIdMappings.js';
import { HealthModule } from './health/health.module.js';
import { UserIdModule } from './modules/user-id/user-id.module.js';

const typeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.getOrThrow<string>('MYSQL_HOST'),
  port: config.getOrThrow<number>('MYSQL_PORT'),
  username: config.getOrThrow<string>('MYSQL_USER'),
  password: config.getOrThrow<string>('MYSQL_PASSWORD'),
  database: config.getOrThrow<string>('MYSQL_DATABASE'),
  // TypeORM's `charset` maps to the MySQL connection collation; utf8mb4 lets the identifier
  // columns and any future free-text column hold the full Unicode range.
  charset: 'utf8mb4_0900_ai_ci',
  // Entities arrive through TypeOrmModule.forFeature() and the migration is imported by name,
  // so no glob pattern has to be resolved at runtime.
  autoLoadEntities: true,
  synchronize: false,
  migrations: [CreateUserIdMappings1790438400000],
  // Running migrations on boot keeps "start the application" a single command; the migrator
  // records what it applied, so repeated starts are no-ops.
  migrationsRun: true,
  timezone: 'Z',
  logging:
    config.get<string>('MYSQL_LOGGING') === 'true'
      ? ['error', 'warn', 'migration']
      : false,
  extra: { connectionLimit: config.getOrThrow<number>('MYSQL_POOL_SIZE') },
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmOptions,
    }),
    UserIdModule,
    HealthModule,
  ],
})
export class AppModule {}
