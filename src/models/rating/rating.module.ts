import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { DgmuModule } from '../dgmu/dgmu.module';
import { StudentModule } from '../student/student.module';
import { SubjectNameModule } from '../subject-name/subject-name.module';
import { SubjectUtilsModule } from '../subject-utils/subject-utils.module';
import { RatingService } from './rating.service';

@Module({
  imports: [StudentModule, SubjectNameModule, SubjectUtilsModule, DgmuModule],
  providers: [RatingService, PrismaService],
  exports: [RatingService]
})
export class RatingModule {}
