import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { SubjectNameService } from './subject-name.service';

@Module({
  providers: [SubjectNameService, PrismaService],
  exports: [SubjectNameService]
})
export class SubjectNameModule {}
