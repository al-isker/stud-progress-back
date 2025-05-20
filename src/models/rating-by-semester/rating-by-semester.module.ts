import { PrismaService } from 'src/prisma.service';
import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { StudentModule } from '../student/student.module';
import { RatingBySemesterService } from './rating-by-semester.service';

@Module({
	imports: [StudentModule, DgmuModule],
	providers: [RatingBySemesterService, PrismaService],
	exports: [RatingBySemesterService]
})
export class RatingBySemesterModule {}
