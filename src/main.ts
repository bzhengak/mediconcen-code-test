import { Logger } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

/** Read before the module exists, because it decides what the module may log at all. */
function loggerLevels(): LogLevel[] {
  switch (process.env.LOG_LEVEL) {
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'debug':
      return ['error', 'warn', 'log', 'debug'];
    case 'verbose':
      return ['error', 'warn', 'log', 'debug', 'verbose'];
    default:
      return ['error', 'warn', 'log'];
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: loggerLevels(),
  });
  const port = app.get(ConfigService).getOrThrow<number>('APP_PORT');

  configureApp(app);

  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API listening on http://localhost:${port}/api/v1 (docs at http://localhost:${port}/docs)`,
    'Bootstrap',
  );
}

await bootstrap();
