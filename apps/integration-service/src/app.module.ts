import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalApiClient } from './external-api.client';
import { IntegrationEvent } from './integration-event.entity';
import { IntegrationOperation } from './integration-operation.entity';
import { AdminController, HealthController, OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: required('DATABASE_HOST'),
      port: Number(required('DATABASE_PORT')),
      username: required('DATABASE_USER'),
      password: required('DATABASE_PASSWORD'),
      database: required('DATABASE_NAME'),
      entities: [IntegrationOperation, IntegrationEvent],
      synchronize: true,
      retryAttempts: 20,
      retryDelay: 1500,
    }),
    TypeOrmModule.forFeature([IntegrationOperation, IntegrationEvent]),
  ],
  controllers: [OperationsController, AdminController, HealthController],
  providers: [OperationsService, ExternalApiClient],
})
export class AppModule {}
