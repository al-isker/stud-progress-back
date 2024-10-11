import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { StudentService } from './student.service';

@Module({
  providers: [StudentService, PrismaService],
  exports: [StudentService]
})
export class StudentModule {}
