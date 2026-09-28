import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';

@Module({
  controllers: [ExternalApiController],
  providers: [ExternalApiService],
})
export class AppModule {}
