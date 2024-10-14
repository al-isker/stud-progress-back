import { Injectable } from '@nestjs/common';
import { StudentService } from 'src/models/student/student.service';
import { UpdateSemesterDto } from './dto/update-semester';

@Injectable()
export class ProfileService {
	constructor(private studentService: StudentService) {}

	private calculateYear(semester: number) {
		return Math.ceil(semester / 2)
	}

	private calculateAverageMark() {
		return Math.random() * 5
	}

 	async getData(id: number) {
		const student = await this.studentService.findById(id)

		// возможно, нужен обработчик ненайденного студента

		const year = this.calculateYear(student.semester)
		const averageMark = this.calculateAverageMark()

		return {
			fullName: student.fullName,
			semester: student.semester,
			year,
			averageMark,
			ratingUpdatedAt: student.ratingUpdatedAt,
		}
	}

	async updateSemester(id: number, dto: UpdateSemesterDto) {
		const student = await this.studentService.update(id, {
			semester: dto.semester
		})

		// возможно, нужен обработчик ненайденного студента

		const year = this.calculateYear(student.semester)
		const averageMark = this.calculateAverageMark()

		return { 
			semester: student.semester, 
			year, 
			averageMark 
		}
	}
}
