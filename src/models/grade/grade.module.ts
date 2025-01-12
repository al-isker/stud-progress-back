import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { DgmuModule } from '../dgmu/dgmu.module';
import { StudentModule } from '../student/student.module';
import { SubjectHelperModule } from '../subject-helper/subject-helper.module';
import { SubjectNameModule } from '../subject-name/subject-name.module';
import { GradeService } from './grade.service';

@Module({
  imports: [StudentModule, SubjectNameModule, SubjectHelperModule, DgmuModule],
  providers: [GradeService, PrismaService],
  exports: [GradeService]
})
export class GradeModule {}
