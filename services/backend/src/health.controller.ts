import { Controller, Get } from '@nestjs/common';
import { Public } from './shared/public.decorator.js';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'factory-engine-pro-backend' };
  }
}
