import { Module } from '@nestjs/common';
import { StudentModule } from 'src/models/student/student.module';
import { PrismaService } from 'src/prisma.service';
import { SubjectHelperService } from './subject-helper.service';

@Module({
  imports: [StudentModule],
  providers: [SubjectHelperService, PrismaService],
  exports: [SubjectHelperService]
})
export class SubjectHelperModule {}
