import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma.service';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';

@Injectable()
export class SchedulerService {
	constructor(
		private prisma: PrismaService,
		private subjectHelperService: SubjectHelperService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateSubjects() {
		const students = await this.prisma.student.findMany();

		for (const student of students) {
			this.subjectHelperService.someUpdate(student)
		}
	}
}
