import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT is required');
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
