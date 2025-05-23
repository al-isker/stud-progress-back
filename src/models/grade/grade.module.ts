import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { GradeService } from './grade.service';

@Module({
	providers: [GradeService, PrismaService],
	exports: [GradeService]
})
export class GradeModule {}
