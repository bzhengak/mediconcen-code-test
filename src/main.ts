import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = app.get(ConfigService).getOrThrow<number>('APP_PORT');

  configureApp(app);

  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API listening on http://localhost:${port}/api/v1 (docs at http://localhost:${port}/docs)`,
    'Bootstrap',
  );
}

await bootstrap();
