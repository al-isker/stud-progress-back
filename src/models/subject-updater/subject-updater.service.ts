import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeService } from '../grade/grade.service';
import { RatingService } from '../rating/rating.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectUpdaterService {
	constructor(
		private studentService: StudentService,
		private gradeService: GradeService,
		private ratingUpdaterService: RatingService,
		private dgmuService: DgmuService
	) {}

	async someUpdate(student: Pick<Student, 'id' | 'fullName' | 'password' | 'semester'>) {
		const { subjectsWithGrade, subjectsWithRating } = await this.dgmuService.findManyOrThrow(student, {
			grade: true,
			rating: true
		})

		await this.gradeService.someUpdate(subjectsWithGrade, student)
		await this.ratingUpdaterService.someUpdate(subjectsWithRating, student)
	}

	async someUpdateAll(student: Pick<Student, 'id' | 'fullName' | 'password' | 'semester'>) {
		const { allSubjectsWithGrade, subjectsWithRating } = await this.dgmuService.findManyOrThrow(student, {
			allGrade: true,
			rating: true
		})

		await this.gradeService.someUpdateAll(allSubjectsWithGrade, student)
		await this.ratingUpdaterService.someUpdate(subjectsWithRating, student)
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId)

		await this.someUpdate(student)
	}
}
