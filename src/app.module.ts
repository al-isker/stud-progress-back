import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './models/auth/auth.module';
import { DeviceInfoModule } from './models/device-info/device-info.module';
import { DgmuModule } from './models/dgmu/dgmu.module';
import { EventModule } from './models/event/event.module';
import { GradeHelperModule } from './models/grade-helper/grade-helper.module';
import { GradeModule } from './models/grade/grade.module';
import { PrismaService } from './models/prisma/prisma.service';
import { ProfileModule } from './models/profile/profile.module';
import { RatingBySemesterHelperModule } from './models/rating-by-semester-helper/rating-by-semester-helper.module';
import { SchedulerModule } from './models/scheduler/scheduler.module';
import { StudentModule } from './models/student/student.module';
import { SubjectHelperModule } from './models/subject-helper/subject-helper.module';
import { SubjectModule } from './models/subject/subject.module';
import { TokenModule } from './models/token/token.module';

@Module({
	imports: [
		ScheduleModule.forRoot(),
		StudentModule,
		TokenModule,
		AuthModule,
		DeviceInfoModule,
		ProfileModule,
		SubjectModule,
		SubjectHelperModule,
		GradeHelperModule,
		RatingBySemesterHelperModule,
		GradeModule,
		EventModule,
		DgmuModule,
		SchedulerModule
	],
	providers: [PrismaService]
})
export class AppModule {}
