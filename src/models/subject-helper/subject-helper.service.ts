import { Injectable } from '@nestjs/common';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeService } from '../grade/grade.service';
import { RatingBySemesterService } from '../rating-by-semester/rating-by-semester.service';
import { StudentService } from '../student/student.service';
import { StudentWithDecryptPassword } from '../student/types/student-with-decrypt-password.type';

@Injectable()
export class SubjectHelperService {
	constructor(
		private studentService: StudentService,
		private gradeService: GradeService,
		private ratingBySemesterService: RatingBySemesterService,
		private dgmuService: DgmuService
	) {}

	async createAll(student: StudentWithDecryptPassword) {
		const { subjectListWithGradeByAllSemesters, subjectListWithEventList } =
			await this.dgmuService.findManyOrThrow(student, {
				gradeByAllSemesters: true,
				eventList: true
			});

		await this.gradeService.createAll(
			subjectListWithGradeByAllSemesters,
			student
		);
		await this.ratingBySemesterService.someUpdate(
			subjectListWithEventList,
			student
		);
	}

	async someUpdate(student: StudentWithDecryptPassword) {
		const { subjectListWithGrade, subjectListWithEventList } =
			await this.dgmuService.findManyOrThrow(student, {
				grade: true,
				eventList: true
			});

		await this.gradeService.someUpdate(subjectListWithGrade, student);
		await this.ratingBySemesterService.someUpdate(
			subjectListWithEventList,
			student
		);
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId);

		await this.someUpdate(student);
	}
}
