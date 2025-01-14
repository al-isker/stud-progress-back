import { Injectable } from '@nestjs/common';
import { StudentService } from 'src/models/student/student.service';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';
import { UpdateSemesterDto } from './dto/update-semester';

@Injectable()
export class ProfileService {
	constructor(
		private studentService: StudentService,
		private subjectHelperService: SubjectHelperService
	) {}

 	async get(studentId: number) {
		const student = await this.studentService.findById(studentId)

		return {
			fullName: student.fullName, 
			course: student.course, 
			semester: student.semester, 
			averageMark: student.averageMark
		}
	}

	async updateSemester(studentId: number, dto: UpdateSemesterDto) {
		const student = await this.studentService.update(studentId, dto)

		await this.subjectHelperService.someUpdate(student)

		return this.get(studentId)
	}
}
