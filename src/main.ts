import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { setupSwagger } from './config/swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = app.get(ConfigService).getOrThrow<number>('APP_PORT');

  app.use(requestIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.setGlobalPrefix('api/v1');
  // Lets UserIdCache close its Redis connection on SIGTERM instead of dropping it.
  app.enableShutdownHooks();
  setupSwagger(app, port);

  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API listening on http://localhost:${port}/api/v1 (docs at /docs)`,
    'Bootstrap',
  );
}

await bootstrap();
