import { Module } from '@nestjs/common';
import { StudentModule } from 'src/models/student/student.module';
import { PrismaService } from 'src/prisma.service';
import { SubjectUtilsService } from './subject-utils.service';

@Module({
  imports: [StudentModule],
  providers: [SubjectUtilsService, PrismaService],
  exports: [SubjectUtilsService]
})
export class SubjectUtilsModule {}
