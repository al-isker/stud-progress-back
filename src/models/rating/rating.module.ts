import { Module } from '@nestjs/common';
import { DgmuModule } from 'src/models/dgmu/dgmu.module';
import { StudentModule } from 'src/models/student/student.module';
import { PrismaService } from 'src/prisma.service';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

@Module({
  imports: [DgmuModule, StudentModule],
  controllers: [RatingController],
  providers: [RatingService, PrismaService],
  exports: [RatingService]
})
export class RatingModule {}
