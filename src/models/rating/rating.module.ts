import { Module } from '@nestjs/common';
import { DgmuModule } from 'src/models/dgmu/dgmu.module';
import { PrismaService } from 'src/prisma.service';
import { StudentModule } from '../student/student.module';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

@Module({
  imports: [StudentModule, DgmuModule],
  controllers: [RatingController],
  providers: [RatingService, PrismaService],
})
export class RatingModule {}
