import { StudentService } from 'src/models/student/student.service';
import { Injectable } from '@nestjs/common';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';
import { UpdateSemesterDto } from './dto/update-semester.dto';

@Injectable()
export class ProfileService {
	constructor(
		private studentService: StudentService,
		private subjectHelperService: SubjectHelperService
	) {}

	async getByStudentId(studentId: number) {
		const student = await this.studentService.findById(studentId);

		return {
			fullName: student.fullName,
			course: student.course,
			semester: student.semester
		};
	}

	async updateSemester(studentId: number, dto: UpdateSemesterDto) {
		const student = await this.studentService.update(studentId, dto);

		await this.subjectHelperService.someUpdate(student);

		return {
			fullName: student.fullName,
			course: student.course,
			semester: student.semester
		};
	}
}
