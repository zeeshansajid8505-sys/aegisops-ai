import { Module } from '@nestjs/common';
import { HealthProbesController } from './health-probes.controller';
import { HealthProbesService } from './health-probes.service';
import { ProbeExecutorService } from './probe-executor.service';

@Module({
  controllers: [HealthProbesController],
  providers: [HealthProbesService, ProbeExecutorService],
  exports: [HealthProbesService, ProbeExecutorService],
})
export class HealthProbesModule {}

