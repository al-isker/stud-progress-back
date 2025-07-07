import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { RatingBySemesterHelperService } from './rating-by-semester-helper.service';

@Module({
	providers: [RatingBySemesterHelperService, PrismaService],
	exports: [RatingBySemesterHelperService]
})
export class RatingBySemesterHelperModule {}
