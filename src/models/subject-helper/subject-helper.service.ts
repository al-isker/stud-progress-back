import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeService } from '../grade/grade.service';
import { RatingService } from '../rating/rating.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectHelperService {
	constructor(
		private studentService: StudentService,
		private gradeService: GradeService,
		private ratingService: RatingService,
		private dgmuService: DgmuService
	) {}

	async someUpdate(student: Pick<Student, 'id' | 'fullName' | 'password' | 'semester'>) {
		const { subjectsWithGrade, subjectsWithRating } = await this.dgmuService.findManyOrThrow(student, {
			grade: true,
			rating: true
		})

		await this.gradeService.someUpdate(subjectsWithGrade, student)
		await this.ratingService.someUpdate(subjectsWithRating, student)
	}

	async someUpdateAll(student: Pick<Student, 'id' | 'fullName' | 'password' | 'semester'>) {
		const { allSubjectsWithGrade, subjectsWithRating } = await this.dgmuService.findManyOrThrow(student, {
			allGrade: true,
			rating: true
		})

		await this.gradeService.someUpdateAll(allSubjectsWithGrade, student)
		await this.ratingService.someUpdate(subjectsWithRating, student)
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId)

		await this.someUpdate(student)
	}
}
