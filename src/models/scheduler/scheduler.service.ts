import { Student } from '@prisma/client';
import { IS_ENABLED_SCHEDULER_UPDATE_SUBJECTS_KEY } from 'src/common/lib/env/env-keys';
import { delay } from 'src/common/lib/light-lodash/delay';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeHelperService } from '../grade-helper/grade-helper.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatingBySemesterHelperService } from '../rating-by-semester-helper/rating-by-semester-helper.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SchedulerService {
	constructor(
		private prisma: PrismaService,
		private configService: ConfigService,
		private studentService: StudentService,
		private gradeHelperService: GradeHelperService,
		private ratingBySemesterHelperService: RatingBySemesterHelperService,
		private dgmuService: DgmuService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateSubjects() {
		const isEnabled =
			this.configService.get(IS_ENABLED_SCHEDULER_UPDATE_SUBJECTS_KEY) ===
			'true';

		if (!isEnabled) return;

		const students = await this.prisma.student.findMany();

		const updateStudent = async (student: Student) => {
			const studentWithDecryptedPassword =
				this.studentService.mapWithDecryptedPassword(student);

			const { subjectListWithGrade, subjectListWithEventList } =
				await this.dgmuService.findMany(studentWithDecryptedPassword, {
					grade: true,
					eventList: true
				});

			await this.gradeHelperService.updateBySemester(
				student,
				subjectListWithGrade
			);

			await this.ratingBySemesterHelperService.updateBySemester(
				student,
				subjectListWithEventList
			);
		};

		const DELAY_MS = 2000;

		const startAt = Date.now();

		return await Promise.allSettled(
			students.map(async (student, index) => {
				const targetStartAt = startAt + index * DELAY_MS;
				const targetDelayMs = targetStartAt - Date.now();

				await delay(targetDelayMs);

				return updateStudent(student);
			})
		);
	}
}
