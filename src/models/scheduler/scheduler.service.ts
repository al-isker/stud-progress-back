import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StudentService } from '../student/student.service';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';

@Injectable()
export class SchedulerService {
	constructor(
		private studentService: StudentService,
		private subjectHelperService: SubjectHelperService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateSubjects() {
		const students = await this.studentService.findAll();

		await Promise.all(
			students.map(async student => {
				try {
					await this.subjectHelperService.updateBySemester(student);
				} catch {}
			})
		);
	}
}
