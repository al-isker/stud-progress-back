import { Injectable } from '@nestjs/common';
import { StudentService } from 'src/models/student/student.service';
import { RatingService } from '../rating/rating.service';
import { UpdateSemesterDto } from './dto/update-semester';

@Injectable()
export class ProfileService {
	constructor(
		private studentService: StudentService,
		private ratingService: RatingService
	) {}

 	async getData(id: number) {
		// возможно, нужен обработчик ненайденного студента
		const {fullName, year, semester, averageMark} = await this.studentService.findById(id)

		return {fullName, year, semester, averageMark}
	}

	async updateSemester(id: number, dto: UpdateSemesterDto) {
		// возможно, нужен обработчик ненайденного студента
		const student = await this.studentService.update(id, dto)

		await this.ratingService.updateRating(student)
		// обновить grade

		const { year, semester, averageMark } = student
		return { year, semester, averageMark }
	}
}
