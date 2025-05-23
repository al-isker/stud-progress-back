import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { RatingBySemesterService } from './rating-by-semester.service';

@Module({
	providers: [RatingBySemesterService, PrismaService],
	exports: [RatingBySemesterService]
})
export class RatingBySemesterModule {}
