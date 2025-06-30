import { Injectable } from '@nestjs/common';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeHelperService } from '../grade-helper/grade-helper.service';
import { RatingBySemesterHelperService } from '../rating-by-semester-helper/rating-by-semester-helper.service';
import { StudentWithDecryptedPassword } from '../student/types/student-with-decrypted-password.type';

@Injectable()
export class SubjectHelperService {
	constructor(
		private gradeHelperService: GradeHelperService,
		private ratingBySemesterHelperService: RatingBySemesterHelperService,
		private dgmuService: DgmuService
	) {}

	async createAll(student: StudentWithDecryptedPassword) {
		const { subjectListWithGradeByAllSemesters, subjectListWithEventList } =
			await this.dgmuService.findMany(student, {
				gradeByAllSemesters: true,
				eventList: true
			});

		await this.gradeHelperService.createAll(
			student,
			subjectListWithGradeByAllSemesters
		);
		await this.ratingBySemesterHelperService.createBySemester(
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

		await this.gradeHelperService.updateBySemester(
			student,
			subjectListWithGrade
		);
		await this.ratingBySemesterHelperService.updateBySemester(
			student,
			subjectListWithEventList
		);
	}
}
