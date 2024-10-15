import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RatingModule } from '../rating/rating.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [RatingModule],
  providers: [SchedulerService, PrismaService],
})
export class SchedulerModule {}
