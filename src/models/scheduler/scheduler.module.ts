import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { GradeHelperModule } from '../grade-helper/grade-helper.module';
import { PrismaService } from '../prisma/prisma.service';
import { RatingBySemesterHelperModule } from '../rating-by-semester-helper/rating-by-semester-helper.module';
import { StudentModule } from '../student/student.module';
import { SchedulerService } from './scheduler.service';

@Module({
	imports: [
		StudentModule,
		GradeHelperModule,
		RatingBySemesterHelperModule,
		DgmuModule
	],
	providers: [SchedulerService, PrismaService]
})
export class SchedulerModule {}
