import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { setupSwagger } from './config/swagger.js';

/**
 * Application wiring lives here rather than in main.ts so the e2e tests exercise exactly the
 * pipes, filters and prefix the real process uses.
 */
export function configureApp(app: INestApplication): void {
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
  setupSwagger(app);
}
