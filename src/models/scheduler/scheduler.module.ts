import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { SubjectUpdaterModule } from '../subject-helper/subject-helper.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [SubjectUpdaterModule],
  providers: [SchedulerService, PrismaService],
})
export class SchedulerModule {}
