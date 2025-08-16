import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';

@Injectable()
export class SchedulerService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private subjectHelperService: SubjectHelperService
	) {}

	@Cron(CronExpression.EVERY_MINUTE)
	async updateSubjects() {
		const students = await this.prisma.student.findMany();

		const studentsWithDecryptedPassword = students.map(item => {
			return this.studentService.mapWithDecryptedPassword(item);
		});

		for (const student of studentsWithDecryptedPassword) {
			this.subjectHelperService.updateBySemester(student).catch(() => {});
		}
	}
}
