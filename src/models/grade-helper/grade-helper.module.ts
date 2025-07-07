import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { GradeHelperService } from './grade-helper.service';

@Module({
	providers: [GradeHelperService, PrismaService],
	exports: [GradeHelperService]
})
export class GradeHelperModule {}
