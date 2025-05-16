import { PrismaService } from 'src/prisma.service';

import { Module } from '@nestjs/common';

import { StudentService } from './student.service';

@Module({
	providers: [StudentService, PrismaService],
	exports: [StudentService]
})
export class StudentModule {}
