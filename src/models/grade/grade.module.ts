import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';

@Module({
	controllers: [GradeController],
	providers: [GradeService, PrismaService]
})
export class GradeModule {}
