import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserIdMapping } from './entities/user-id-mapping.entity.js';
import { UserIdController } from './user-id.controller.js';
import { UserIdCache } from './user-id.cache.js';
import { UserIdService } from './user-id.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserIdMapping])],
  controllers: [UserIdController],
  providers: [UserIdService, UserIdCache],
  // Only the cache is shared: HealthModule reports on it, nothing else uses these providers.
  exports: [UserIdCache],
})
export class UserIdModule {}
