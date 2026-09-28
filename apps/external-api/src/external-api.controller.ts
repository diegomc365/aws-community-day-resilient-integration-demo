import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';

@Controller()
export class ExternalApiController {
  constructor(private readonly externalApi: ExternalApiService) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('transactions')
  createTransaction(): { id: string } {
    return this.externalApi.createTransaction();
  }

  @Post('transactions/:id/confirm')
  @HttpCode(200)
  confirmTransaction(@Param('id') id: string): { id: string; status: 'CONFIRMED' } {
    return this.externalApi.confirmTransaction(id);
  }

  @Get('admin/mode')
  getModes() {
    return this.externalApi.getModes();
  }

  @Put('admin/mode')
  setModes(@Body() body: unknown) {
    return this.externalApi.setModes(body);
  }

  @Post('admin/reset')
  @HttpCode(200)
  reset() {
    return this.externalApi.reset();
  }

  @Get('admin/stats')
  getStats() {
    return this.externalApi.getStats();
  }
}
