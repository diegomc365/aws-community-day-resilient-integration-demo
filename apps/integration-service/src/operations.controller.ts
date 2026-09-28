import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post()
  create(@Body() body: { id?: string; orderNumber?: string }) {
    return this.operations.create(body ?? {});
  }

  @Post(':id/process')
  @HttpCode(200)
  process(@Param('id') id: string) {
    return this.operations.process(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.operations.retry(id);
  }

  @Get(':id/events')
  events(@Param('id') id: string) {
    return this.operations.getEvents(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.operations.get(id);
  }
}

@Controller('admin')
export class AdminController {
  constructor(private readonly operations: OperationsService) {}

  @Post('demo-reset')
  resetDemo() {
    return this.operations.resetDemo();
  }
}

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
