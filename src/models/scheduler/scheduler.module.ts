import { Module } from '@nestjs/common';

import { StudentModule } from '../student/student.module';
import { SubjectUpdaterModule } from '../subject-helper/subject-helper.module';
import { SchedulerService } from './scheduler.service';

@Module({
	imports: [StudentModule, SubjectUpdaterModule],
	providers: [SchedulerService]
})
export class SchedulerModule {}
