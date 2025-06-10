import { Injectable } from '@nestjs/common';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeService } from '../grade/grade.service';
import { RatingBySemesterService } from '../rating-by-semester/rating-by-semester.service';
import { StudentWithDecryptedPassword } from '../student/types/student-with-decrypted-password.type';

@Injectable()
export class SubjectHelperService {
	constructor(
		private gradeService: GradeService,
		private ratingBySemesterService: RatingBySemesterService,
		private dgmuService: DgmuService
	) {}

	async createAll(student: StudentWithDecryptedPassword) {
		const { subjectListWithGradeByAllSemesters, subjectListWithEventList } =
			await this.dgmuService.findMany(student, {
				gradeByAllSemesters: true,
				eventList: true
			});

		await this.gradeService.createAll(
			student,
			subjectListWithGradeByAllSemesters
		);
		await this.ratingBySemesterService.createBySemester(
			student,
			subjectListWithEventList
		);
	}

	async updateBySemester(student: StudentWithDecryptedPassword) {
		const { subjectListWithGrade, subjectListWithEventList } =
			await this.dgmuService.findMany(student, {
				grade: true,
				eventList: true
			});

		await this.gradeService.updateBySemester(student, subjectListWithGrade);
		await this.ratingBySemesterService.updateBySemester(
			student,
			subjectListWithEventList
		);
	}
}
