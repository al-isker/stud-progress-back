import { Module } from '@nestjs/common';
import { StudentModule } from '../student/student.module';
import { SubjectHelperModule } from '../subject-helper/subject-helper.module';
import { SchedulerService } from './scheduler.service';

@Module({
	imports: [StudentModule, SubjectHelperModule],
	providers: [SchedulerService]
})
export class SchedulerModule {}
