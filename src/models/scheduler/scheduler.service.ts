import { Injectable } from '@nestjs/common';
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
		private studentService: StudentService,
		private gradeHelperService: GradeHelperService,
		private ratingBySemesterHelperService: RatingBySemesterHelperService,
		private dgmuService: DgmuService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateSubjects() {
		const students = await this.prisma.student.findMany();

		const studentsWithDecryptedPassword = students.map(item => {
			return this.studentService.mapWithDecryptedPassword(item);
		});

		for (const student of studentsWithDecryptedPassword) {
			try {
				const { subjectListWithGrade, subjectListWithEventList } =
					await this.dgmuService.findMany(student, {
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
			} catch {}
		}
	}
}
