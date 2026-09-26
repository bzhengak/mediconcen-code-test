import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Served at /docs, outside the api/v1 prefix. It stays enabled in every environment because a
 * reviewer can reach it straight from the container; behind a real deployment it would be an
 * internal-only route.
 */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MediConCen User ID Resolution API')
      .setDescription(
        'Maps an (id1, id2) pair to a stable userID. The first call for a pair generates a ' +
          'UUID v4 and stores it; every later call returns the stored value.',
      )
      .setVersion('1.0.0')
      .addTag('user-id', 'Resolve a userID from a business id pair')
      .addTag(
        'health',
        'Liveness and readiness of the API and its dependencies',
      )
      .build(),
  );

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { docExpansion: 'list', tryItOutEnabled: true },
  });
}
