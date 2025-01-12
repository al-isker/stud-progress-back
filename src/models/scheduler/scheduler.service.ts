import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma.service';
import { SubjectUpdaterService } from '../subject-updater/subject-updater.service';

@Injectable()
export class SchedulerService {
	constructor(
		private prisma: PrismaService,
		private subjectUpdaterService: SubjectUpdaterService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateSubjects() {
		const students = await this.prisma.student.findMany();

		for (const student of students) {
			this.subjectUpdaterService.someUpdate(student)
		}
	}
}
