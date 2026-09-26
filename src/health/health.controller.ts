import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report dependency status',
    description:
      'Always 200 while the process is serving: a degraded report means Redis is unreachable and requests are being answered from MySQL alone.',
  })
  @ApiOkResponse({
    description: 'Process is serving, possibly in degraded mode.',
  })
  async health(): Promise<HealthReport> {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      '503 only when MySQL is unavailable, because that is when the API cannot answer correctly.',
  })
  @ApiOkResponse({ description: 'Ready to serve.' })
  @ApiServiceUnavailableResponse({
    description: 'MySQL unreachable; not accepting traffic.',
  })
  async ready(@Res() res: Response): Promise<void> {
    const report = await this.healthService.check();
    const status =
      report.checks.mysql.status === 'up'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json(report);
  }
}
