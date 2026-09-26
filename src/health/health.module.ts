import { Module } from '@nestjs/common';
import { UserIdModule } from '../modules/user-id/user-id.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [UserIdModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
