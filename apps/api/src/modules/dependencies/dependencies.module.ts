import { Module } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { DependenciesController } from './dependencies.controller';

@Module({
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}

